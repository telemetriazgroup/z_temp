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

export async function resetSenalComputed() {
  await query(`UPDATE senal_evento SET episodio_id = NULL WHERE episodio_id IS NOT NULL`);
  await query(`TRUNCATE senal_episodio RESTART IDENTITY`);
  await query(`TRUNCATE senal_resumen_mes`);
  await query(`TRUNCATE senal_device_state`);
  await query(`TRUNCATE senal_mes_meta`);
  await query(
    `UPDATE senal_cursor SET last_captured_at = NULL, updated_at = now() WHERE id = 1`
  );
  await query(
    `UPDATE senal_job SET
       status = 'idle', processed = 0, devices_seen = 0,
       last_imei = NULL, last_nombre = NULL, last_captured_at = NULL,
       error = NULL, started_at = NULL, updated_at = now()
     WHERE id = 1`
  );
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
                    open_tipo, open_started_at, last_telemetry, open_datos_inicio
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
       open_tipo, open_started_at, last_telemetry, open_datos_inicio, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb, now())
     ON CONFLICT (imei) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_device_state.codigo),
       row_key = COALESCE(EXCLUDED.row_key, senal_device_state.row_key),
       last_estado = EXCLUDED.last_estado,
       last_captured_at = EXCLUDED.last_captured_at,
       open_tipo = EXCLUDED.open_tipo,
       open_started_at = EXCLUDED.open_started_at,
       last_telemetry = COALESCE(EXCLUDED.last_telemetry, senal_device_state.last_telemetry),
       open_datos_inicio = EXCLUDED.open_datos_inicio,
       updated_at = now()`,
    [
      row.imei,
      row.codigo ?? null,
      row.row_key ?? null,
      row.last_estado ?? null,
      row.last_captured_at,
      row.open_tipo ?? null,
      row.open_started_at ?? null,
      row.last_telemetry ? JSON.stringify(row.last_telemetry) : null,
      row.open_datos_inicio ? JSON.stringify(row.open_datos_inicio) : null,
    ]
  );
}

export async function insertEpisodio(ep) {
  const r = await query(
    `INSERT INTO senal_episodio (
       imei, codigo, tipo, started_at, ended_at, duration_min,
       recovered, start_hour, end_hour, anio, mes,
       datos_inicio, datos_fin
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
     RETURNING id`,
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
      ep.datos_inicio ? JSON.stringify(ep.datos_inicio) : null,
      ep.datos_fin ? JSON.stringify(ep.datos_fin) : null,
    ]
  );
  return r.rows[0]?.id ?? null;
}

export async function updateEpisodioDatos(id, datosInicio, datosFin) {
  await query(
    `UPDATE senal_episodio SET
       datos_inicio = COALESCE($2::jsonb, datos_inicio),
       datos_fin = COALESCE($3::jsonb, datos_fin)
     WHERE id = $1`,
    [
      id,
      datosInicio ? JSON.stringify(datosInicio) : null,
      datosFin ? JSON.stringify(datosFin) : null,
    ]
  );
}

export async function bumpLastDisconnect(imei, anio, mes, at, codigo = null, nombre = null) {
  await query(
    `INSERT INTO senal_resumen_mes (
       imei, anio, mes, codigo, nombre, last_disconnect_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (imei, anio, mes) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_resumen_mes.codigo),
       nombre = COALESCE(EXCLUDED.nombre, senal_resumen_mes.nombre),
       last_disconnect_at = GREATEST(
         COALESCE(senal_resumen_mes.last_disconnect_at, EXCLUDED.last_disconnect_at),
         EXCLUDED.last_disconnect_at
       ),
       updated_at = now()`,
    [imei, anio, mes, codigo, nombre, at]
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
     ORDER BY r.last_disconnect_at DESC NULLS LAST,
              (r.wait_total_min + r.offline_total_min) DESC, r.imei`,
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
    `SELECT id, imei, codigo, tipo, started_at, ended_at, duration_min,
            recovered, start_hour, end_hour, anio, mes,
            datos_inicio, datos_fin
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
       samples_seen, last_estado, last_captured_at, last_disconnect_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,
       $8,$9,$10,
       $11::jsonb, $12::jsonb,
       COALESCE($13, 0), $14, $15, $16, now()
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
       last_disconnect_at = GREATEST(
         COALESCE(senal_resumen_mes.last_disconnect_at, EXCLUDED.last_disconnect_at),
         EXCLUDED.last_disconnect_at
       ),
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
      ep.started_at ?? null,
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
  let sql = `SELECT imei, codigo, row_key, estado_conexion, captured_at,
                    power_state, telemetry
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
    `SELECT imei, codigo, row_key, estado_conexion, captured_at,
            power_state, telemetry
     FROM dashboard_device_sample
     WHERE captured_at >= $1::timestamp AT TIME ZONE 'America/Lima'
       AND captured_at < $2::timestamp AT TIME ZONE 'America/Lima'
     ORDER BY imei ASC, captured_at ASC`,
    [fromIso, toIso]
  );
  return r.rows;
}

export async function listEpisodiosImei(imei, limit = 200) {
  const r = await query(
    `SELECT id, imei, codigo, tipo, started_at, ended_at, duration_min,
            recovered, start_hour, end_hour, anio, mes,
            datos_inicio, datos_fin
     FROM senal_episodio
     WHERE imei = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [String(imei), limit]
  );
  return r.rows;
}

export async function listEventosImei(imei, limit = 200) {
  const r = await query(
    `SELECT id, imei, episodio_id, tipo, titulo, nota,
            occurred_at, created_at, created_by
     FROM senal_evento
     WHERE imei = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT $2`,
    [String(imei), limit]
  );
  return r.rows;
}

export async function listEventosMes(anio, mes, imeis = null) {
  const params = [anio, mes];
  let filter = '';
  if (Array.isArray(imeis) && imeis.length) {
    params.push(imeis);
    filter = ` AND e.imei = ANY($${params.length})`;
  }
  const r = await query(
    `SELECT e.id, e.imei, e.episodio_id, e.tipo, e.titulo, e.nota,
            e.occurred_at, e.created_at, e.created_by
     FROM senal_evento e
     WHERE (
       EXTRACT(YEAR FROM (e.occurred_at AT TIME ZONE 'America/Lima')) = $1
       AND EXTRACT(MONTH FROM (e.occurred_at AT TIME ZONE 'America/Lima')) = $2
     )${filter}
     ORDER BY e.occurred_at DESC
     LIMIT 2000`,
    params
  );
  return r.rows;
}

const EVENT_TIPOS = new Set([
  'corte_energia',
  'sin_cobertura',
  'mantenimiento',
  'traslado',
  'puerto',
  'clima',
  'otro',
]);

export async function insertEvento(input, actorUsername) {
  const imei = String(input.imei ?? '').trim();
  if (!imei) throw new Error('IMEI obligatorio');
  const tipo = EVENT_TIPOS.has(String(input.tipo ?? ''))
    ? String(input.tipo)
    : 'otro';
  const titulo = input.titulo?.toString().trim() || null;
  const nota = input.nota?.toString().trim() || null;
  if (!titulo && !nota) throw new Error('Indique un título o una nota del evento');
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Fecha de evento inválida');
  const episodioId = input.episodioId ? Number(input.episodioId) : null;

  const r = await query(
    `INSERT INTO senal_evento (
       imei, episodio_id, tipo, titulo, nota, occurred_at, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, imei, episodio_id, tipo, titulo, nota,
               occurred_at, created_at, created_by`,
    [
      imei,
      Number.isFinite(episodioId) ? episodioId : null,
      tipo,
      titulo,
      nota,
      occurredAt,
      actorUsername ?? null,
    ]
  );
  return r.rows[0];
}

export async function listKnownDevices() {
  const r = await query(
    `SELECT imei, codigo, row_key, last_estado_conexion, last_seen_at
     FROM dashboard_known_device
     ORDER BY last_seen_at DESC NULLS LAST`
  );
  return r.rows;
}

export async function getSenalJob() {
  const r = await query(`SELECT * FROM senal_job WHERE id = 1`);
  if (r.rows[0]) return r.rows[0];
  await query(`INSERT INTO senal_job (id, status) VALUES (1, 'idle') ON CONFLICT (id) DO NOTHING`);
  const again = await query(`SELECT * FROM senal_job WHERE id = 1`);
  return again.rows[0];
}

export async function updateSenalJob(patch) {
  const current = await getSenalJob();
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) next[k] = v;
  }
  await query(
    `UPDATE senal_job SET
       status = $1,
       mode = $2,
       processed = $3,
       devices_seen = $4,
       last_imei = $5,
       last_nombre = $6,
       last_captured_at = $7,
       error = $8,
       started_at = $9,
       started_by = $10,
       updated_at = now()
     WHERE id = 1`,
    [
      next.status ?? 'idle',
      next.mode ?? 'incremental',
      next.processed ?? 0,
      next.devices_seen ?? 0,
      next.last_imei ?? null,
      next.last_nombre ?? null,
      next.last_captured_at ?? null,
      next.error ?? null,
      next.started_at ?? null,
      next.started_by ?? null,
    ]
  );
  return getSenalJob();
}

export async function deleteEvento(id, imei = null) {
  const params = [Number(id)];
  let sql = `DELETE FROM senal_evento WHERE id = $1`;
  if (imei) {
    params.push(String(imei));
    sql += ` AND imei = $2`;
  }
  sql += ` RETURNING id`;
  const r = await query(sql, params);
  return r.rows[0] ?? null;
}

export { EMPTY_HOURS, asHours, EVENT_TIPOS };
