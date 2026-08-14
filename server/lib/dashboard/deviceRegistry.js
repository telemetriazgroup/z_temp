import { query } from '../db.js';
import { deviceRowKey } from '../telemetry.js';

/**
 * Upsert flota vista desde último-estado.
 * Un equipo es "nuevo" solo si su row_key (codigo-imei) no existía antes
 * en dashboard_known_device (no registrado previamente).
 * El primer llenado de la tabla (bootstrap) marca todos como revisado.
 * Devuelve los INSERT posteriores a ese bootstrap.
 */
export async function upsertKnownDevices(dispositivos) {
  const nuevos = [];
  const now = new Date().toISOString();
  const countR = await query(
    `SELECT COUNT(*)::int AS n FROM dashboard_known_device`
  );
  const bootstrapping = (countR.rows[0]?.n ?? 0) === 0;
  const initialStatus = bootstrapping ? 'revisado' : 'pendiente';

  for (const d of dispositivos) {
    const rowKey = deviceRowKey(d);
    const conexion = String(d.estado_conexion ?? 'offline').toLowerCase();
    const power =
      d.power_state_texto === 'on' || d.power_state_texto === 'off'
        ? d.power_state_texto
        : null;

    const r = await query(
      `INSERT INTO dashboard_known_device (
         row_key, imei, codigo, first_seen_at, last_seen_at,
         first_estado_conexion, review_status,
         last_estado_conexion, last_power_state, meta
       ) VALUES ($1,$2,$3,$4,$4,$5,$6,$5,$7,$8::jsonb)
       ON CONFLICT (row_key) DO UPDATE SET
         last_seen_at = EXCLUDED.last_seen_at,
         codigo = COALESCE(EXCLUDED.codigo, dashboard_known_device.codigo),
         last_estado_conexion = EXCLUDED.last_estado_conexion,
         last_power_state = EXCLUDED.last_power_state
       RETURNING row_key, imei, codigo, first_seen_at, review_status,
                 (xmax = 0) AS inserted`,
      [
        rowKey,
        d.imei,
        d.codigo ?? null,
        now,
        conexion,
        initialStatus,
        power,
        JSON.stringify({
          ultima_actualizacion: d.ultima_actualizacion ?? null,
        }),
      ]
    );

    const row = r.rows[0];
    const inserted = row?.inserted === true || row?.inserted === 't';
    if (inserted && !bootstrapping) {
      nuevos.push({
        rowKey: row.row_key,
        imei: row.imei,
        codigo: row.codigo,
        first_seen_at: row.first_seen_at,
        review_status: row.review_status,
      });
    }
  }

  return nuevos;
}

export async function listDevicesPendingReview({ limit = 20 } = {}) {
  const r = await query(
    `SELECT row_key, imei, codigo, first_seen_at, last_seen_at,
            first_estado_conexion, last_estado_conexion, last_power_state,
            review_status
     FROM dashboard_known_device
     WHERE review_status = 'pendiente'
     ORDER BY first_seen_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapKnown);
}

export async function listRecentlyRegistered({ limit = 12 } = {}) {
  const r = await query(
    `SELECT row_key, imei, codigo, first_seen_at, last_seen_at,
            first_estado_conexion, last_estado_conexion, last_power_state,
            review_status
     FROM dashboard_known_device
     ORDER BY first_seen_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapKnown);
}

export async function markDeviceReviewed(rowKey, { status = 'revisado', by = null } = {}) {
  const allowed = new Set(['revisado', 'ignorado', 'pendiente']);
  const reviewStatus = allowed.has(status) ? status : 'revisado';
  const r = await query(
    `UPDATE dashboard_known_device
     SET review_status = $2,
         reviewed_at = CASE WHEN $2 = 'pendiente' THEN NULL ELSE now() END,
         reviewed_by = CASE WHEN $2 = 'pendiente' THEN NULL ELSE $3 END
     WHERE row_key = $1
     RETURNING row_key, imei, codigo, first_seen_at, last_seen_at,
               first_estado_conexion, last_estado_conexion, last_power_state,
               review_status, reviewed_at, reviewed_by`,
    [rowKey, reviewStatus, by]
  );
  return r.rows[0] ? mapKnown(r.rows[0]) : null;
}

function mapKnown(row) {
  return {
    rowKey: row.row_key,
    imei: row.imei,
    codigo: row.codigo,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    first_estado_conexion: row.first_estado_conexion,
    last_estado_conexion: row.last_estado_conexion,
    last_power_state: row.last_power_state,
    review_status: row.review_status,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
  };
}
