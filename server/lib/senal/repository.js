import { query } from '../db.js';

const EMPTY_HOURS = () => Array(24).fill(0);

function asHours(raw) {
  if (Array.isArray(raw) && raw.length === 24) {
    return raw.map((n) => Math.round(Number(n) || 0));
  }
  return EMPTY_HOURS();
}

export async function getSenalCursor() {
  const r = await query(
    `SELECT last_captured_at FROM senal_cursor WHERE id = 1`
  );
  return r.rows[0]?.last_captured_at
    ? new Date(r.rows[0].last_captured_at)
    : null;
}

export async function setSenalCursor(capturedAt) {
  await query(
    `INSERT INTO senal_cursor (id, last_captured_at, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET
       last_captured_at = EXCLUDED.last_captured_at,
       updated_at = now()`,
    [capturedAt]
  );
}

export async function getDeviceStates(imeis = null) {
  if (Array.isArray(imeis) && imeis.length === 0) return new Map();
  let sql = `SELECT imei, codigo, row_key, last_estado, last_captured_at,
                    open_tipo, open_started_at
             FROM senal_device_state`;
  const params = [];
  if (Array.isArray(imeis)) {
    params.push(imeis);
    sql += ` WHERE imei = ANY($1)`;
  }
  const r = await query(sql, params);
  return new Map(r.rows.map((row) => [row.imei, row]));
}

export async function upsertDeviceState(row) {
  await query(
    `INSERT INTO senal_device_state (
       imei, codigo, row_key, last_estado, last_captured_at,
       open_tipo, open_started_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (imei) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_device_state.codigo),
       row_key = COALESCE(EXCLUDED.row_key, senal_device_state.row_key),
       last_estado = EXCLUDED.last_estado,
       last_captured_at = EXCLUDED.last_captured_at,
       open_tipo = EXCLUDED.open_tipo,
       open_started_at = EXCLUDED.open_started_at,
       updated_at = now()`,
    [
      row.imei,
      row.codigo ?? null,
      row.row_key ?? null,
      row.last_estado ?? null,
      row.last_captured_at,
      row.open_tipo ?? null,
      row.open_started_at ?? null,
    ]
  );
}

export async function insertEpisodio(ep) {
  await query(
    `INSERT INTO senal_episodio (
       imei, codigo, tipo, started_at, ended_at, duration_min,
       recovered, start_hour, end_hour, anio, mes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      ep.imei,
      ep.codigo ?? null,
      ep.tipo,
      ep.started_at,
      ep.ended_at,
      ep.duration_min,
      ep.recovered !== false,
      ep.start_hour ?? null,
      ep.end_hour ?? null,
      ep.anio,
      ep.mes,
    ]
  );
}

export async function getResumenMes(anio, mes, imei = null) {
  const params = [anio, mes];
  let filter = '';
  if (imei) {
    params.push(String(imei));
    filter = ` AND r.imei = $${params.length}`;
  }
  const r = await query(
    `SELECT r.*, u.pais, u.departamento, u.provincia, u.distrito, u.zona,
            u.observaciones, u.latitud, u.longitud
     FROM senal_resumen_mes r
     LEFT JOIN senal_ubicacion u ON u.imei = r.imei
     WHERE r.anio = $1 AND r.mes = $2${filter}
     ORDER BY (r.wait_total_min + r.offline_total_min) DESC, r.imei`,
    params
  );
  return r.rows.map((row) => ({
    ...row,
    hourly_wait_min: asHours(row.hourly_wait_min),
    hourly_offline_min: asHours(row.hourly_offline_min),
  }));
}

export async function listEpisodiosMes(anio, mes, imei = null) {
  const params = [anio, mes];
  let filter = '';
  if (imei) {
    params.push(String(imei));
    filter = ` AND imei = $${params.length}`;
  }
  const r = await query(
    `SELECT imei, codigo, tipo, started_at, ended_at, duration_min,
            recovered, start_hour, end_hour, anio, mes
     FROM senal_episodio
     WHERE anio = $1 AND mes = $2${filter}
     ORDER BY started_at DESC
     LIMIT 5000`,
    params
  );
  return r.rows;
}

/**
 * Aplica un episodio cerrado al resumen del mes (acumulativo, merge en JS).
 */
export async function applyEpisodeToResumenSimplified(ep, hourlyWaitDelta, hourlyOfflineDelta) {
  const existing = await query(
    `SELECT * FROM senal_resumen_mes
     WHERE imei = $1 AND anio = $2 AND mes = $3`,
    [ep.imei, ep.anio, ep.mes]
  );
  const prev = existing.rows[0];
  const hw = asHours(prev?.hourly_wait_min);
  const ho = asHours(prev?.hourly_offline_min);
  const dw = hourlyWaitDelta ?? EMPTY_HOURS();
  const dOff = hourlyOfflineDelta ?? EMPTY_HOURS();
  for (let i = 0; i < 24; i++) {
    hw[i] += Math.round(Number(dw[i]) || 0);
    ho[i] += Math.round(Number(dOff[i]) || 0);
  }

  const waitEp = ep.tipo === 'wait' ? 1 : 0;
  const offlineEp = ep.tipo === 'offline' ? 1 : 0;
  const waitRec = ep.tipo === 'wait' && ep.recovered ? 1 : 0;
  const offlineRec = ep.tipo === 'offline' && ep.recovered ? 1 : 0;
  const waitDelta = ep.tipo === 'wait' ? ep.duration_min : 0;
  const offlineDelta = ep.tipo === 'offline' ? ep.duration_min : 0;

  await query(
    `INSERT INTO senal_resumen_mes (
       imei, anio, mes, codigo,
       wait_episodes, wait_recovered, wait_total_min,
       offline_episodes, offline_recovered, offline_total_min,
       hourly_wait_min, hourly_offline_min,
       samples_seen, last_estado, last_captured_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,
       $8,$9,$10,
       $11::jsonb, $12::jsonb,
       COALESCE($13, 0), $14, $15, now()
     )
     ON CONFLICT (imei, anio, mes) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_resumen_mes.codigo),
       wait_episodes = EXCLUDED.wait_episodes,
       wait_recovered = EXCLUDED.wait_recovered,
       wait_total_min = EXCLUDED.wait_total_min,
       offline_episodes = EXCLUDED.offline_episodes,
       offline_recovered = EXCLUDED.offline_recovered,
       offline_total_min = EXCLUDED.offline_total_min,
       hourly_wait_min = EXCLUDED.hourly_wait_min,
       hourly_offline_min = EXCLUDED.hourly_offline_min,
       updated_at = now()`,
    [
      ep.imei,
      ep.anio,
      ep.mes,
      ep.codigo ?? prev?.codigo ?? null,
      (prev?.wait_episodes ?? 0) + waitEp,
      (prev?.wait_recovered ?? 0) + waitRec,
      (prev?.wait_total_min ?? 0) + waitDelta,
      (prev?.offline_episodes ?? 0) + offlineEp,
      (prev?.offline_recovered ?? 0) + offlineRec,
      (prev?.offline_total_min ?? 0) + offlineDelta,
      JSON.stringify(hw),
      JSON.stringify(ho),
      prev?.samples_seen ?? 0,
      prev?.last_estado ?? null,
      prev?.last_captured_at ?? null,
    ]
  );
}

export async function bumpResumenSample(imei, anio, mes, codigo, estado, capturedAt) {
  await query(
    `INSERT INTO senal_resumen_mes (
       imei, anio, mes, codigo, samples_seen, last_estado, last_captured_at, updated_at
     ) VALUES ($1,$2,$3,$4, 1, $5, $6, now())
     ON CONFLICT (imei, anio, mes) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_resumen_mes.codigo),
       samples_seen = senal_resumen_mes.samples_seen + 1,
       last_estado = EXCLUDED.last_estado,
       last_captured_at = EXCLUDED.last_captured_at,
       updated_at = now()`,
    [imei, anio, mes, codigo ?? null, estado, capturedAt]
  );
}

export async function getMesMeta(anio, mes) {
  const r = await query(
    `SELECT * FROM senal_mes_meta WHERE anio = $1 AND mes = $2`,
    [anio, mes]
  );
  return r.rows[0] ?? null;
}

export async function upsertMesMeta(anio, mes, patch) {
  await query(
    `INSERT INTO senal_mes_meta (
       anio, mes, processed_once, finalized, sample_count, device_count,
       first_processed_at, last_processed_at
     ) VALUES (
       $1,$2,
       COALESCE($3, false), COALESCE($4, false),
       COALESCE($5, 0), COALESCE($6, 0),
       COALESCE($7, now()), now()
     )
     ON CONFLICT (anio, mes) DO UPDATE SET
       processed_once = senal_mes_meta.processed_once OR EXCLUDED.processed_once,
       finalized = senal_mes_meta.finalized OR EXCLUDED.finalized,
       sample_count = GREATEST(senal_mes_meta.sample_count, EXCLUDED.sample_count),
       device_count = GREATEST(senal_mes_meta.device_count, EXCLUDED.device_count),
       first_processed_at = COALESCE(senal_mes_meta.first_processed_at, EXCLUDED.first_processed_at),
       last_processed_at = now()`,
    [
      anio,
      mes,
      patch.processed_once ?? false,
      patch.finalized ?? false,
      patch.sample_count ?? 0,
      patch.device_count ?? 0,
      patch.first_processed_at ?? null,
    ]
  );
}

export async function countSamplesInMonth(fromIso, toIso) {
  const r = await query(
    `SELECT COUNT(*)::int AS n,
            COUNT(DISTINCT imei)::int AS devices
     FROM dashboard_device_sample
     WHERE captured_at >= $1::timestamp AT TIME ZONE 'America/Lima'
       AND captured_at < $2::timestamp AT TIME ZONE 'America/Lima'`,
    [fromIso, toIso]
  );
  return {
    sample_count: r.rows[0]?.n ?? 0,
    device_count: r.rows[0]?.devices ?? 0,
  };
}

export async function fetchSamplesAfter(after, limit = 5000) {
  const params = [];
  let sql = `SELECT imei, codigo, row_key, estado_conexion, captured_at
             FROM dashboard_device_sample`;
  if (after) {
    params.push(after.toISOString());
    sql += ` WHERE captured_at > $1::timestamptz`;
  }
  sql += ` ORDER BY captured_at ASC, imei ASC LIMIT $${params.length + 1}`;
  params.push(limit);
  const r = await query(sql, params);
  return r.rows;
}

export async function fetchSamplesInMonth(fromIso, toIso) {
  const r = await query(
    `SELECT imei, codigo, row_key, estado_conexion, captured_at
     FROM dashboard_device_sample
     WHERE captured_at >= $1::timestamp AT TIME ZONE 'America/Lima'
       AND captured_at < $2::timestamp AT TIME ZONE 'America/Lima'
     ORDER BY imei ASC, captured_at ASC`,
    [fromIso, toIso]
  );
  return r.rows;
}

export { EMPTY_HOURS, asHours };
