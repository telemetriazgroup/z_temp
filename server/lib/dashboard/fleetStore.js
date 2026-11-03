import { query } from '../db.js';
import {
  deviceRowKey,
  mergeStarcoolOrigenes,
  ultimaActualizacionMs,
} from '../telemetry.js';

function minutosDesde(ultima) {
  const ms = ultimaActualizacionMs(ultima);
  if (Number.isNaN(ms)) return null;
  return Math.round(((Date.now() - ms) / 60000) * 10) / 10;
}

function mapRow(row) {
  const payload =
    row.payload != null && typeof row.payload === 'object' ? row.payload : {};
  const ausente = row.ausente_api === true;
  const minutos = minutosDesde(payload.ultima_actualizacion);
  return {
    ...payload,
    imei: payload.imei ?? row.imei,
    codigo: payload.codigo ?? row.codigo ?? null,
    minutos_desde_ultimo_dato:
      minutos ?? payload.minutos_desde_ultimo_dato ?? null,
    estado_conexion: ausente
      ? 'offline'
      : payload.estado_conexion ?? 'offline',
    ausente_api: ausente,
    ausente_desde: row.ausente_desde
      ? new Date(row.ausente_desde).toISOString()
      : null,
    last_api_at: row.last_api_at ? new Date(row.last_api_at).toISOString() : null,
  };
}

/** Flota guardada. STARCOOL y STARCOOL2 del mismo IMEI quedan en un solo equipo. */
export async function loadCurrentDispositivos() {
  const r = await query(
    `SELECT row_key, imei, codigo, payload, ausente_api, ausente_desde, last_api_at
     FROM dashboard_device_current`
  );
  return mergeStarcoolOrigenes(r.rows.map(mapRow));
}

export async function countCurrentDevices() {
  const list = await loadCurrentDispositivos();
  const ausentes = list.filter((d) => d.ausente_api === true).length;
  return {
    total: list.length,
    presentes: list.length - ausentes,
    ausentes,
  };
}

/**
 * Guarda el último payload de los equipos que sí vinieron en un origen.
 * Si el mismo equipo reaparece, deja de estar marcado como ausente.
 */
export async function upsertCurrentDevices(dispositivos, seenAt) {
  const rows = [];
  for (const d of dispositivos) {
    if (d?.imei == null || d.imei === '') continue;
    rows.push({
      row_key: deviceRowKey(d),
      imei: String(d.imei),
      codigo: d.codigo ?? null,
      payload: d,
    });
  }
  if (!rows.length) return 0;
  await query(
    `INSERT INTO dashboard_device_current (
       row_key, imei, codigo, payload, ausente_api, ausente_desde, last_api_at, updated_at
     )
     SELECT row_key, imei, codigo, payload, false, NULL, $2::timestamptz, $2::timestamptz
     FROM jsonb_to_recordset($1::jsonb) AS x(
       row_key text, imei text, codigo text, payload jsonb
     )
     ON CONFLICT (row_key) DO UPDATE SET
       imei = EXCLUDED.imei,
       codigo = COALESCE(EXCLUDED.codigo, dashboard_device_current.codigo),
       payload = EXCLUDED.payload,
       ausente_api = false,
       ausente_desde = NULL,
       last_api_at = EXCLUDED.last_api_at,
       updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(rows), seenAt]
  );
  return rows.length;
}

/**
 * El origen respondió y estos row_key no vinieron.
 * Se conservan con su último payload y quedan ausentes (no se borran).
 */
export async function markSourceDevicesAbsent(codigo, presentRowKeys, seenAt) {
  if (!codigo) return 0;
  const r = await query(
    `UPDATE dashboard_device_current
     SET ausente_api = true,
         ausente_desde = COALESCE(ausente_desde, $3::timestamptz),
         updated_at = $3::timestamptz
     WHERE codigo = $1
       AND ausente_api = false
       AND NOT (row_key = ANY($2::text[]))`,
    [codigo, presentRowKeys, seenAt]
  );
  return r.rowCount ?? 0;
}

export async function saveSyncState(row) {
  await query(
    `INSERT INTO dashboard_sync_state (
       id, started_at, finished_at, trigger, ok, error, detail
     ) VALUES (1, $1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       started_at = EXCLUDED.started_at,
       finished_at = EXCLUDED.finished_at,
       trigger = EXCLUDED.trigger,
       ok = EXCLUDED.ok,
       error = EXCLUDED.error,
       detail = EXCLUDED.detail`,
    [
      row.started_at ?? null,
      row.finished_at ?? null,
      row.trigger ?? null,
      row.ok ?? null,
      row.error ?? null,
      JSON.stringify(row.detail ?? {}),
    ]
  );
}

export async function getSyncState() {
  const r = await query(
    `SELECT started_at, finished_at, trigger, ok, error, detail
     FROM dashboard_sync_state
     WHERE id = 1`
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    trigger: row.trigger ?? null,
    ok: row.ok,
    error: row.error ?? null,
    detail: row.detail ?? {},
  };
}
