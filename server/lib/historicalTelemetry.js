const TUNEL_BASE = process.env.TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const STARCOOL_BASE = process.env.STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';

import { formatoFechaQueryApi } from './timezone.js';

const MS_HORA = 60 * 60 * 1000;
export const HISTORICAL_WINDOW_HOURS = 12;

function buildHistorialUrl(codigo, imei) {
  const safe = encodeURIComponent(imei);
  switch (codigo) {
    case 'TUNEL':
      return `${TUNEL_BASE}/Tunel/buscar_datos_oficiales/${safe}`;
    case 'TERMOKING':
      return `${TUNEL_BASE}/TermoKing/buscar_datos_oficiales/${safe}`;
    case 'STARCOOL':
      return `${STARCOOL_BASE}/Starcool/buscar_datos_oficiales/${safe}`;
    default:
      throw new Error(`Origen no soportado: ${codigo}`);
  }
}

function timestampRegistro(row) {
  const v = row.created_at ?? row.fecha ?? null;
  if (v == null || v === '') return NaN;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function toleranciaSetpoint(setPoint) {
  if (setPoint === 0 || Number.isNaN(setPoint)) return 0.5;
  return Math.abs(setPoint) * 0.1;
}

function enBandaSetpoint(valor, setPoint) {
  if (valor == null || Number.isNaN(valor) || setPoint == null || Number.isNaN(setPoint)) {
    return null;
  }
  const t = toleranciaSetpoint(setPoint);
  return valor >= setPoint - t && valor <= setPoint + t;
}

/** @returns {boolean | null} */
export function rowEnRango(row) {
  if (row.en_rango === true) return true;
  if (row.en_rango === false) return false;

  const setPoint = row.set_point;
  if (setPoint == null || Number.isNaN(setPoint)) return null;

  const sup = row.temp_supply_1;
  const ret = row.return_air;
  const supOk = enBandaSetpoint(sup, setPoint);
  const retOk = enBandaSetpoint(ret, setPoint);
  if (supOk == null && retOk == null) return null;
  if (supOk === false || retOk === false) return false;
  if (supOk === true && retOk === true) return true;
  return null;
}

/**
 * Busca el inicio del episodio actual fuera de rango en la ventana (más antiguo punto
 * consecutivo fuera de rango hasta el presente).
 * @param {object[]} datos
 * @param {Date} [referencia]
 * @returns {string | null} ISO de la referencia
 */
export function resolveOutOfRangeSince(datos, referencia = new Date()) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({
      row,
      ts: timestampRegistro(row),
      enRango: rowEnRango(row),
    }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return null;

  let sinceTs = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const { ts, enRango } = sorted[i];
    if (enRango === false) {
      sinceTs = ts;
      continue;
    }
    if (enRango === true) break;
  }

  if (sinceTs != null) return new Date(sinceTs).toISOString();

  const windowStart = referencia.getTime() - HISTORICAL_WINDOW_HOURS * MS_HORA;
  const allFalse = sorted.every((x) => x.enRango === false);
  if (allFalse && sorted.length > 0) {
    const oldest = sorted[0].ts;
    return new Date(Math.max(oldest, windowStart)).toISOString();
  }

  return null;
}

/**
 * @param {string} codigo TUNEL | TERMOKING | STARCOOL
 * @param {string} imei
 * @param {number} horas
 * @param {Date} [referencia]
 */
export async function fetchHistorialUltimasHoras(codigo, imei, horas = HISTORICAL_WINDOW_HOURS, referencia = new Date()) {
  const fechaFinal = referencia;
  const fechaInicial = new Date(referencia.getTime() - horas * MS_HORA);
  let url = buildHistorialUrl(codigo, imei);
  const params = new URLSearchParams({
    fecha_inicial: formatoFechaQueryApi(fechaInicial),
    fecha_final: formatoFechaQueryApi(fechaFinal),
  });
  url = `${url}?${params.toString()}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Historial HTTP ${res.status}`);
  const json = await res.json();
  if (json?.code !== 200 || !Array.isArray(json?.data?.datos)) {
    throw new Error(json?.message ?? 'Respuesta de historial inválida');
  }
  return json.data;
}

export function horasDesdeReferencia(sinceIso, now = new Date()) {
  const start = new Date(sinceIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (now.getTime() - start) / MS_HORA);
}

export function horasEnterasDesdeReferencia(sinceIso, now = new Date()) {
  return Math.floor(horasDesdeReferencia(sinceIso, now));
}
