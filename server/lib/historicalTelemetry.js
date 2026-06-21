const TUNEL_BASE = process.env.TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const STARCOOL_BASE = process.env.STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';

import { formatoFechaQueryApi } from './timezone.js';
import { getMargenesSetpoint, toleranciaSetpointDefault } from './rangoTemperatura.js';
import { defrostActivoEfectivo, filaDefrostEfectivo, isEquipoEncendido } from './powerState.js';

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
  return toleranciaSetpointDefault(setPoint);
}

function enBandaSetpoint(valor, setPoint, rangoOpts) {
  if (valor == null || Number.isNaN(valor) || setPoint == null || Number.isNaN(setPoint)) {
    return null;
  }
  const { inferior, superior } = getMargenesSetpoint(setPoint, rangoOpts);
  return valor >= setPoint - inferior && valor <= setPoint + superior;
}

/**
 * Evalúa si el registro está en rango operativo.
 * Durante defrost el retorno sube pero el suministro suele mantenerse en banda:
 * eso NO debe contarse como fuera de rango ni generar alertas.
 * @param {object} row
 * @param {{ useRangoPersonalizado?: boolean, margenInferior?: number, margenSuperior?: number } | null} [rangoOpts]
 * @returns {boolean | null}
 */
export function rowEnRangoEffective(row, rangoOpts = null) {
  if (row == null) return null;
  if (filaDefrostEfectivo(row)) return true;

  if (rangoOpts?.useRangoPersonalizado) {
    const retOk = enBandaSetpoint(row.return_air, row.set_point, rangoOpts);
    if (retOk === true) return true;
    if (retOk === false) return false;
    return null;
  }

  if (row.en_rango === true) return true;

  const setPoint = row.set_point;
  const sup = row.temp_supply_1;
  const ret = row.return_air;

  if (setPoint != null && sup != null && enBandaSetpoint(sup, setPoint, rangoOpts) === true) {
    return true;
  }

  if (row.en_rango === false) return false;

  const supOk = enBandaSetpoint(sup, setPoint, rangoOpts);
  const retOk = enBandaSetpoint(ret, setPoint, rangoOpts);
  if (supOk === false || retOk === false) return false;
  if (supOk === true && retOk === true) return true;
  return null;
}

/** @deprecated usar rowEnRangoEffective */
export function rowEnRango(row) {
  return rowEnRangoEffective(row);
}

/**
 * Misma lógica que historial, aplicada al último estado del dispositivo.
 * @param {object} dispositivo
 * @param {{ useRangoPersonalizado?: boolean, margenInferior?: number, margenSuperior?: number } | null} [rangoOpts]
 * @returns {boolean | null}
 */
export function effectiveEnRangoFromDispositivo(dispositivo, rangoOpts = null) {
  if (dispositivo == null) return null;
  if (defrostActivoEfectivo(dispositivo)) return true;

  const d = dispositivo.ultimo_dato ?? {};

  if (rangoOpts?.useRangoPersonalizado) {
    const retOk = enBandaSetpoint(d.return_air, d.set_point, rangoOpts);
    if (retOk === true) return true;
    if (retOk === false) return false;
    return null;
  }

  if (dispositivo.en_rango === true) return true;

  const row = {
    en_rango: dispositivo.en_rango,
    en_defrost: dispositivo.en_defrost,
    set_point: d.set_point,
    temp_supply_1: d.temp_supply_1,
    return_air: d.return_air,
  };

  const fromRow = rowEnRangoEffective(row, rangoOpts);
  if (fromRow === true) return true;
  if (dispositivo.en_rango === false) return false;
  return fromRow;
}

/**
 * Inicio del episodio **continuo actual** fuera de rango efectivo (hacia atrás desde ahora).
 * Se detiene en el primer punto en rango o dato nulo (no une episodios separados por defrost).
 */
export function resolveOutOfRangeSince(datos, referencia = new Date(), rangoOpts = null) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({
      row,
      ts: timestampRegistro(row),
      effective: rowEnRangoEffective(row, rangoOpts),
    }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return null;

  const latest = sorted[sorted.length - 1];
  if (latest.effective !== false) return null;

  let sinceTs = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const { ts, effective } = sorted[i];
    if (effective === false) {
      sinceTs = ts;
      continue;
    }
    if (effective === true) break;
    if (sinceTs != null) break;
  }

  if (sinceTs != null) return new Date(sinceTs).toISOString();
  return null;
}

/**
 * Ajusta o invalida la referencia persistida según historial reciente.
 * @returns {{ since: string, resetUmbrales: boolean } | null} null = equipo recuperado (en rango)
 */
export function reconcileEpisodeReference(episode, datos, now = new Date(), rangoOpts = null) {
  const resolved = resolveOutOfRangeSince(datos, now, rangoOpts);
  if (resolved == null) return null;

  const prev = new Date(episode.since).getTime();
  const next = new Date(resolved).getTime();
  if (Number.isNaN(prev) || Math.abs(next - prev) > 60_000) {
    return { since: resolved, resetUmbrales: true };
  }
  return { since: episode.since, resetUmbrales: false };
}

export async function fetchHistorialUltimasHoras(
  codigo,
  imei,
  horas = HISTORICAL_WINDOW_HOURS,
  referencia = new Date()
) {
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
