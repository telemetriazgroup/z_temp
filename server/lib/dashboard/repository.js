import { query, withClient } from '../db.js';

export async function insertFleetSnapshot(client, row) {
  const r = await client.query(
    `INSERT INTO dashboard_fleet_snapshot (
      captured_at, total, online, wait, offline,
      power_on, power_off, en_defrost,
      en_rango, fuera_rango, apagado, indeterminado,
      pct_online, pct_en_rango, by_codigo
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb
    ) RETURNING id, captured_at`,
    [
      row.captured_at,
      row.total,
      row.online,
      row.wait,
      row.offline,
      row.power_on,
      row.power_off,
      row.en_defrost,
      row.en_rango,
      row.fuera_rango,
      row.apagado,
      row.indeterminado,
      row.pct_online,
      row.pct_en_rango,
      JSON.stringify(row.by_codigo ?? {}),
    ]
  );
  return r.rows[0];
}

export async function insertDeviceSamples(client, snapshotId, samples) {
  if (!samples.length) return 0;
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < samples.length; i += CHUNK) {
    const chunk = samples.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let p = 1;
    for (const s of chunk) {
      values.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      params.push(
        snapshotId,
        s.captured_at,
        s.imei,
        s.codigo ?? null,
        s.row_key,
        s.estado_conexion,
        s.power_state,
        s.rango_estado,
        s.en_defrost ?? null
      );
    }
    await client.query(
      `INSERT INTO dashboard_device_sample (
        snapshot_id, captured_at, imei, codigo, row_key,
        estado_conexion, power_state, rango_estado, en_defrost
      ) VALUES ${values.join(',')}`,
      params
    );
    inserted += chunk.length;
  }
  return inserted;
}

export async function pruneDashboardHistory({
  fleetDays = 180,
  deviceDays = 120,
} = {}) {
  await query(
    `DELETE FROM dashboard_fleet_snapshot
     WHERE captured_at < now() - ($1::text || ' days')::interval`,
    [String(fleetDays)]
  );
  // device samples cascade with fleet deletes; also prune orphans older than deviceDays
  await query(
    `DELETE FROM dashboard_device_sample
     WHERE captured_at < now() - ($1::text || ' days')::interval`,
    [String(deviceDays)]
  );
}

/**
 * Promedio de conteos en ventanas (día / semana / mes).
 * Si `imeis` es array (usuario restringido), recalcula desde device samples;
 * array vacío → ceros. Si `imeis` es null, usa fleet snapshots globales.
 */
export async function getPeriodAverages({ imeis = null } = {}) {
  if (Array.isArray(imeis)) {
    return getPeriodAveragesFromDevices(imeis);
  }
  return getPeriodAveragesFromFleet();
}

async function avgQueryFleet(interval) {
  const r = await query(
    `SELECT
       COUNT(*)::int AS samples,
       COALESCE(AVG(online), 0)::float AS online,
       COALESCE(AVG(wait), 0)::float AS wait,
       COALESCE(AVG(offline), 0)::float AS offline,
       COALESCE(AVG(en_rango), 0)::float AS en_rango,
       COALESCE(AVG(fuera_rango), 0)::float AS fuera_rango,
       COALESCE(AVG(pct_online), 0)::float AS pct_online,
       COALESCE(AVG(pct_en_rango), 0)::float AS pct_en_rango,
       COALESCE(AVG(total), 0)::float AS total
     FROM dashboard_fleet_snapshot
     WHERE captured_at >= now() - ($1::text)::interval`,
    [interval]
  );
  return roundAvgRow(r.rows[0]);
}

async function getPeriodAveragesFromFleet() {
  const [dia, semana, mes] = await Promise.all([
    avgQueryFleet('1 day'),
    avgQueryFleet('7 days'),
    avgQueryFleet('30 days'),
  ]);
  return { dia, semana, mes };
}

async function avgQueryDevices(interval, imeis) {
  const r = await query(
    `WITH per_snap AS (
       SELECT
         snapshot_id,
         COUNT(*) FILTER (WHERE estado_conexion = 'online')::float AS online,
         COUNT(*) FILTER (WHERE estado_conexion = 'wait')::float AS wait,
         COUNT(*) FILTER (WHERE estado_conexion = 'offline')::float AS offline,
         COUNT(*) FILTER (WHERE rango_estado = 'normal')::float AS en_rango,
         COUNT(*) FILTER (WHERE rango_estado = 'fuera')::float AS fuera_rango,
         COUNT(*)::float AS total
       FROM dashboard_device_sample
       WHERE captured_at >= now() - ($1::text)::interval
         AND imei = ANY($2::text[])
       GROUP BY snapshot_id
     )
     SELECT
       COUNT(*)::int AS samples,
       COALESCE(AVG(online), 0)::float AS online,
       COALESCE(AVG(wait), 0)::float AS wait,
       COALESCE(AVG(offline), 0)::float AS offline,
       COALESCE(AVG(en_rango), 0)::float AS en_rango,
       COALESCE(AVG(fuera_rango), 0)::float AS fuera_rango,
       COALESCE(AVG(CASE WHEN total > 0 THEN 100.0 * online / total ELSE 0 END), 0)::float AS pct_online,
       COALESCE(AVG(
         CASE WHEN (en_rango + fuera_rango) > 0
           THEN 100.0 * en_rango / (en_rango + fuera_rango)
           ELSE NULL END
       ), 0)::float AS pct_en_rango,
       COALESCE(AVG(total), 0)::float AS total
     FROM per_snap`,
    [interval, imeis]
  );
  return roundAvgRow(r.rows[0]);
}

async function getPeriodAveragesFromDevices(imeis) {
  if (!imeis.length) {
    const empty = roundAvgRow(null);
    return { dia: empty, semana: empty, mes: empty };
  }
  const [dia, semana, mes] = await Promise.all([
    avgQueryDevices('1 day', imeis),
    avgQueryDevices('7 days', imeis),
    avgQueryDevices('30 days', imeis),
  ]);
  return { dia, semana, mes };
}

function roundAvgRow(row) {
  if (!row) {
    return {
      samples: 0,
      online: 0,
      wait: 0,
      offline: 0,
      en_rango: 0,
      fuera_rango: 0,
      pct_online: 0,
      pct_en_rango: 0,
      total: 0,
    };
  }
  const n = (v) => Math.round((Number(v) || 0) * 10) / 10;
  return {
    samples: Number(row.samples) || 0,
    online: n(row.online),
    wait: n(row.wait),
    offline: n(row.offline),
    en_rango: n(row.en_rango),
    fuera_rango: n(row.fuera_rango),
    pct_online: n(row.pct_online),
    pct_en_rango: n(row.pct_en_rango),
    total: n(row.total),
  };
}

/** Serie diaria (últimos `days` días, zona America/Lima ≈ GMT-5). */
export async function getDailySeries({ days = 7, imeis = null } = {}) {
  if (Array.isArray(imeis)) {
    return getDailySeriesFromDevices(days, imeis);
  }
  const r = await query(
    `SELECT
       to_char((captured_at AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS day,
       COALESCE(AVG(online), 0)::float AS online,
       COALESCE(AVG(wait), 0)::float AS wait,
       COALESCE(AVG(offline), 0)::float AS offline,
       COALESCE(AVG(en_rango), 0)::float AS en_rango,
       COALESCE(AVG(fuera_rango), 0)::float AS fuera_rango,
       COALESCE(AVG(pct_online), 0)::float AS pct_online,
       COALESCE(AVG(pct_en_rango), 0)::float AS pct_en_rango,
       COUNT(*)::int AS samples
     FROM dashboard_fleet_snapshot
     WHERE captured_at >= (now() AT TIME ZONE 'America/Lima')::date AT TIME ZONE 'America/Lima'
                         - ($1::int - 1) * INTERVAL '1 day'
     GROUP BY 1
     ORDER BY 1`,
    [days]
  );
  return r.rows.map((row) => ({
    day: row.day,
    online: Math.round(Number(row.online) * 10) / 10,
    wait: Math.round(Number(row.wait) * 10) / 10,
    offline: Math.round(Number(row.offline) * 10) / 10,
    en_rango: Math.round(Number(row.en_rango) * 10) / 10,
    fuera_rango: Math.round(Number(row.fuera_rango) * 10) / 10,
    pct_online: Math.round(Number(row.pct_online) * 10) / 10,
    pct_en_rango: Math.round(Number(row.pct_en_rango) * 10) / 10,
    samples: Number(row.samples) || 0,
  }));
}

async function getDailySeriesFromDevices(days, imeis) {
  if (!imeis.length) return [];
  const r = await query(
    `WITH per_snap AS (
       SELECT
         snapshot_id,
         (captured_at AT TIME ZONE 'America/Lima')::date AS day,
         COUNT(*) FILTER (WHERE estado_conexion = 'online')::float AS online,
         COUNT(*) FILTER (WHERE estado_conexion = 'wait')::float AS wait,
         COUNT(*) FILTER (WHERE estado_conexion = 'offline')::float AS offline,
         COUNT(*) FILTER (WHERE rango_estado = 'normal')::float AS en_rango,
         COUNT(*) FILTER (WHERE rango_estado = 'fuera')::float AS fuera_rango,
         COUNT(*)::float AS total
       FROM dashboard_device_sample
       WHERE captured_at >= (now() AT TIME ZONE 'America/Lima')::date AT TIME ZONE 'America/Lima'
                           - ($1::int - 1) * INTERVAL '1 day'
         AND imei = ANY($2::text[])
       GROUP BY snapshot_id, 2
     )
     SELECT
       to_char(day, 'YYYY-MM-DD') AS day,
       COALESCE(AVG(online), 0)::float AS online,
       COALESCE(AVG(wait), 0)::float AS wait,
       COALESCE(AVG(offline), 0)::float AS offline,
       COALESCE(AVG(en_rango), 0)::float AS en_rango,
       COALESCE(AVG(fuera_rango), 0)::float AS fuera_rango,
       COALESCE(AVG(CASE WHEN total > 0 THEN 100.0 * online / total ELSE 0 END), 0)::float AS pct_online,
       COALESCE(AVG(
         CASE WHEN (en_rango + fuera_rango) > 0
           THEN 100.0 * en_rango / (en_rango + fuera_rango)
           ELSE 0 END
       ), 0)::float AS pct_en_rango,
       COUNT(*)::int AS samples
     FROM per_snap
     GROUP BY day
     ORDER BY day`,
    [days, imeis]
  );
  return r.rows.map((row) => ({
    day: row.day,
    online: Math.round(Number(row.online) * 10) / 10,
    wait: Math.round(Number(row.wait) * 10) / 10,
    offline: Math.round(Number(row.offline) * 10) / 10,
    en_rango: Math.round(Number(row.en_rango) * 10) / 10,
    fuera_rango: Math.round(Number(row.fuera_rango) * 10) / 10,
    pct_online: Math.round(Number(row.pct_online) * 10) / 10,
    pct_en_rango: Math.round(Number(row.pct_en_rango) * 10) / 10,
    samples: Number(row.samples) || 0,
  }));
}

export async function getLatestFleetSnapshot() {
  const r = await query(
    `SELECT * FROM dashboard_fleet_snapshot
     ORDER BY captured_at DESC
     LIMIT 1`
  );
  return r.rows[0] ?? null;
}

export async function saveSnapshotTransaction(fleetRow, samples) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const inserted = await insertFleetSnapshot(client, fleetRow);
      const n = await insertDeviceSamples(client, inserted.id, samples);
      await client.query('COMMIT');
      return { id: inserted.id, captured_at: inserted.captured_at, devices: n };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}
