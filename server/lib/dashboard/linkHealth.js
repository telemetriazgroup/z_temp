import { query } from '../db.js';

function countByConexion(dispositivos) {
  let online = 0;
  let wait = 0;
  let offline = 0;
  for (const d of dispositivos) {
    const s = String(d.estado_conexion ?? '').toLowerCase();
    if (s === 'online') online++;
    else if (s === 'wait') wait++;
    else offline++;
  }
  return { online, wait, offline, total: dispositivos.length };
}

function sampleFromDevices(dispositivos, limit = 12) {
  return dispositivos.slice(0, limit).map((d) => ({
    imei: d.imei,
    codigo: d.codigo ?? null,
    estado_conexion: d.estado_conexion ?? null,
    power_state_texto: d.power_state_texto ?? null,
    ultima_actualizacion: d.ultima_actualizacion ?? null,
  }));
}

/**
 * Persiste sonda + último estatus de cada link API consultado.
 * @param {Array<{
 *   codigo: string,
 *   url: string,
 *   ok: boolean,
 *   latencyMs?: number|null,
 *   error?: string|null,
 *   dispositivos?: object[],
 * }>} links
 */
export async function recordLinkProbes(links) {
  if (!Array.isArray(links) || links.length === 0) return;
  const checkedAt = new Date().toISOString();

  for (const link of links) {
    const dispositivos = link.ok ? link.dispositivos ?? [] : [];
    const counts = countByConexion(dispositivos);
    const sample = {
      devices: sampleFromDevices(dispositivos),
      counts,
    };

    await query(
      `INSERT INTO dashboard_link_probe (
         codigo, checked_at, ok, latency_ms, error_message,
         device_count, online_count, wait_count, offline_count, sample
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        link.codigo,
        checkedAt,
        Boolean(link.ok),
        link.latencyMs ?? null,
        link.ok ? null : String(link.error ?? 'error').slice(0, 500),
        counts.total,
        counts.online,
        counts.wait,
        counts.offline,
        JSON.stringify(sample),
      ]
    );

    if (link.ok) {
      await query(
        `INSERT INTO dashboard_link_status (
           codigo, url, ok, checked_at, latency_ms, error_message,
           device_count, online_count, wait_count, offline_count,
           last_ok_at, last_success
         ) VALUES ($1,$2,true,$3,$4,NULL,$5,$6,$7,$8,$3,$9::jsonb)
         ON CONFLICT (codigo) DO UPDATE SET
           url = EXCLUDED.url,
           ok = true,
           checked_at = EXCLUDED.checked_at,
           latency_ms = EXCLUDED.latency_ms,
           error_message = NULL,
           device_count = EXCLUDED.device_count,
           online_count = EXCLUDED.online_count,
           wait_count = EXCLUDED.wait_count,
           offline_count = EXCLUDED.offline_count,
           last_ok_at = EXCLUDED.last_ok_at,
           last_success = EXCLUDED.last_success`,
        [
          link.codigo,
          link.url ?? null,
          checkedAt,
          link.latencyMs ?? null,
          counts.total,
          counts.online,
          counts.wait,
          counts.offline,
          JSON.stringify(sample),
        ]
      );
    } else {
      await query(
        `INSERT INTO dashboard_link_status (
           codigo, url, ok, checked_at, latency_ms, error_message,
           device_count, online_count, wait_count, offline_count,
           last_error_at
         ) VALUES ($1,$2,false,$3,$4,$5,0,0,0,0,$3)
         ON CONFLICT (codigo) DO UPDATE SET
           url = COALESCE(EXCLUDED.url, dashboard_link_status.url),
           ok = false,
           checked_at = EXCLUDED.checked_at,
           latency_ms = EXCLUDED.latency_ms,
           error_message = EXCLUDED.error_message,
           last_error_at = EXCLUDED.last_error_at`,
        [
          link.codigo,
          link.url ?? null,
          checkedAt,
          link.latencyMs ?? null,
          String(link.error ?? 'error').slice(0, 500),
        ]
      );
    }
  }

  await query(
    `DELETE FROM dashboard_link_probe
     WHERE checked_at < now() - interval '3 hours'`
  );
}

export async function getLinkStatuses() {
  const r = await query(
    `SELECT codigo, url, ok, checked_at, latency_ms, error_message,
            device_count, online_count, wait_count, offline_count,
            last_ok_at, last_error_at, last_success
     FROM dashboard_link_status
     ORDER BY codigo`
  );
  return r.rows.map((row) => ({
    codigo: row.codigo,
    url: row.url,
    ok: row.ok,
    checked_at: row.checked_at,
    latency_ms: row.latency_ms,
    error_message: row.error_message,
    device_count: Number(row.device_count) || 0,
    online_count: Number(row.online_count) || 0,
    wait_count: Number(row.wait_count) || 0,
    offline_count: Number(row.offline_count) || 0,
    last_ok_at: row.last_ok_at,
    last_error_at: row.last_error_at,
    last_success: row.last_success ?? {},
  }));
}

/** Serie de sondas últimas 3 h (para trazabilidad en dashboard). */
export async function getLinkProbeHistory({ hours = 3 } = {}) {
  const r = await query(
    `SELECT codigo, checked_at, ok, latency_ms, error_message,
            device_count, online_count, wait_count, offline_count
     FROM dashboard_link_probe
     WHERE checked_at >= now() - ($1::text || ' hours')::interval
     ORDER BY checked_at ASC`,
    [String(hours)]
  );
  return r.rows.map((row) => ({
    codigo: row.codigo,
    checked_at: row.checked_at,
    ok: row.ok,
    latency_ms: row.latency_ms,
    error_message: row.error_message,
    device_count: Number(row.device_count) || 0,
    online_count: Number(row.online_count) || 0,
    wait_count: Number(row.wait_count) || 0,
    offline_count: Number(row.offline_count) || 0,
  }));
}
