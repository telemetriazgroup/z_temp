import { query } from '../db.js';

function optStr(v) {
  const s = v?.toString().trim();
  return s ? s : null;
}

function optNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listSenalUbicaciones() {
  const r = await query(
    `SELECT imei, codigo, pais, departamento, provincia, distrito, zona,
            observaciones, latitud, longitud, updated_at, updated_by
     FROM senal_ubicacion
     ORDER BY pais NULLS LAST, departamento NULLS LAST, imei`
  );
  return r.rows;
}

export async function getSenalUbicacion(imei) {
  const r = await query(
    `SELECT imei, codigo, pais, departamento, provincia, distrito, zona,
            observaciones, latitud, longitud, updated_at, updated_by
     FROM senal_ubicacion WHERE imei = $1`,
    [String(imei)]
  );
  return r.rows[0] ?? null;
}

/**
 * Upsert ubicación / observaciones de un IMEI.
 * @param {string} imei
 * @param {object} input
 * @param {string} [actorUsername]
 */
export async function upsertSenalUbicacion(imei, input = {}, actorUsername) {
  const key = String(imei ?? '').trim();
  if (!key) throw new Error('IMEI obligatorio');

  const row = {
    imei: key,
    codigo: optStr(input.codigo),
    pais: optStr(input.pais),
    departamento: optStr(input.departamento),
    provincia: optStr(input.provincia),
    distrito: optStr(input.distrito),
    zona: optStr(input.zona),
    observaciones: optStr(input.observaciones),
    latitud: optNum(input.latitud),
    longitud: optNum(input.longitud),
    updated_by: optStr(actorUsername),
  };

  const r = await query(
    `INSERT INTO senal_ubicacion (
       imei, codigo, pais, departamento, provincia, distrito, zona,
       observaciones, latitud, longitud, updated_at, updated_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), $11
     )
     ON CONFLICT (imei) DO UPDATE SET
       codigo = COALESCE(EXCLUDED.codigo, senal_ubicacion.codigo),
       pais = EXCLUDED.pais,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       zona = EXCLUDED.zona,
       observaciones = EXCLUDED.observaciones,
       latitud = COALESCE(EXCLUDED.latitud, senal_ubicacion.latitud),
       longitud = COALESCE(EXCLUDED.longitud, senal_ubicacion.longitud),
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING imei, codigo, pais, departamento, provincia, distrito, zona,
               observaciones, latitud, longitud, updated_at, updated_by`,
    [
      row.imei,
      row.codigo,
      row.pais,
      row.departamento,
      row.provincia,
      row.distrito,
      row.zona,
      row.observaciones,
      row.latitud,
      row.longitud,
      row.updated_by,
    ]
  );
  return r.rows[0];
}
