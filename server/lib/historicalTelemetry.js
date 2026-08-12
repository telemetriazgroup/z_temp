const TUNEL_BASE = process.env.TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const STARCOOL_BASE = process.env.STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';
const STARCOOL2_BASE = process.env.STARCOOL2_API_BASE ?? TUNEL_BASE;

import { formatoFechaQueryApi, parseTelemetryDate, parseTelemetryTimestamp, startOfDayMs, formatTimeShortTz, formatChartAxisLabel, formatDateTimeTz } from './timezone.js';
import { getMargenesSetpoint, toleranciaSetpointDefault } from './rangoTemperatura.js';
import { defrostActivoEfectivo, filaDefrostEfectivo } from './powerState.js';

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
    case 'STARCOOL2':
      return `${STARCOOL2_BASE}/Starcool/buscar_datos_oficiales/${safe}`;
    default:
      throw new Error(`Origen no soportado: ${codigo}`);
  }
}

function timestampRegistro(row) {
  const v = row.created_at ?? row.fecha ?? null;
  if (v == null || v === '') return NaN;
  return parseTelemetryTimestamp(v);
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
 * Solo temperatura (return_air vs setpoint), sin tratar defrost como en rango.
 * Usado para anclar el incidente continuo y el correo «volvió a rango».
 */
export function rowEnRangoTemperaturaParaAlerta(row, rangoOpts = null) {
  if (row == null) return null;
  if (row.power_state === 0) return null;
  return enBandaSetpoint(row.return_air, row.set_point, rangoOpts);
}

/**
 * Evalúa en/fuera de rango para **suprimir alertas en el ciclo actual**.
 * `return_air` es la guía; defrost con equipo ON no cuenta como fuera de rango.
 * @returns {boolean | null} null = sin dato o equipo OFF en fila
 */
export function rowEnRangoParaAlerta(row, rangoOpts = null) {
  if (row == null) return null;
  if (row.power_state === 0) return null;
  if (filaDefrostEfectivo(row)) return true;
  return rowEnRangoTemperaturaParaAlerta(row, rangoOpts);
}

/**
 * Último estado del dispositivo con la misma lógica que alertas (return_air guía).
 * Incluye defrost como “en rango” (no alertar fuera durante defrost).
 */
export function effectiveEnRangoAlertaFromDispositivo(dispositivo, rangoOpts = null) {
  if (dispositivo == null) return null;
  if (defrostActivoEfectivo(dispositivo)) return true;

  const d = dispositivo.ultimo_dato ?? {};
  if (d.power_state === 0) return null;

  return rowEnRangoParaAlerta(
    {
      power_state: d.power_state,
      en_defrost: dispositivo.en_defrost,
      set_point: d.set_point,
      return_air: d.return_air,
    },
    rangoOpts
  );
}

/**
 * Solo banda de temperatura (return_air vs setpoint).
 * No trata defrost como recuperación real — sirve para cerrar incidente y correo «volvió a rango».
 */
export function enRangoTemperaturaAlertaFromDispositivo(dispositivo, rangoOpts = null) {
  if (dispositivo == null) return null;
  const d = dispositivo.ultimo_dato ?? {};
  if (d.power_state === 0) return null;
  return enBandaSetpoint(d.return_air, d.set_point, rangoOpts);
}

function sortHistorialConEffective(datos, evalFn, rangoOpts) {
  return [...(datos ?? [])]
    .map((row) => ({
      row,
      ts: timestampRegistro(row),
      effective: evalFn(row, rangoOpts),
    }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Intervalos fuera de rango (menor → mayor) para trazabilidad de incidentes.
 * @param {Function} [evalFn] evaluador en_rango (default: alertas correo)
 * @returns {{ since: string, until: string | null, durationHours: number }[]}
 */
export function computeOutOfRangeIntervals(
  datos,
  rangoOpts = null,
  referencia = new Date(),
  evalFn = rowEnRangoParaAlerta
) {
  const sorted = sortHistorialConEffective(datos, evalFn, rangoOpts);
  const intervals = [];
  let open = null;
  const MS_HORA_LOCAL = 60 * 60 * 1000;

  for (const { ts, effective } of sorted) {
    if (effective === false) {
      if (open == null) {
        open = { sinceTs: ts, sinceIso: new Date(ts).toISOString() };
      }
      continue;
    }
    if (effective === true && open != null) {
      intervals.push({
        since: open.sinceIso,
        until: new Date(ts).toISOString(),
        durationHours:
          Math.round(((ts - open.sinceTs) / MS_HORA_LOCAL) * 1000) / 1000,
      });
      open = null;
    }
  }

  if (open != null) {
    const untilTs = referencia.getTime();
    intervals.push({
      since: open.sinceIso,
      until: null,
      durationHours:
        Math.round(((untilTs - open.sinceTs) / MS_HORA_LOCAL) * 1000) / 1000,
    });
  }

  return intervals;
}

function resolveOutOfRangeSinceWithEval(datos, referencia, rangoOpts, evalFn) {
  const sorted = sortHistorialConEffective(datos, evalFn, rangoOpts);
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
 * Inicio del episodio continuo actual fuera de rango para alertas.
 * Usa solo temperatura (defrost no corta ni cierra el incidente).
 */
export function resolveAlertOutOfRangeSince(datos, referencia = new Date(), rangoOpts = null) {
  return resolveOutOfRangeSinceWithEval(
    datos,
    referencia,
    rangoOpts,
    rowEnRangoTemperaturaParaAlerta
  );
}

/**
 * Inicio del episodio **continuo actual** fuera de rango efectivo (hacia atrás desde ahora).
 * Se detiene en el primer punto en rango o dato nulo (no une episodios separados por defrost).
 */
export function resolveOutOfRangeSince(datos, referencia = new Date(), rangoOpts = null) {
  return resolveOutOfRangeSinceWithEval(datos, referencia, rangoOpts, rowEnRangoEffective);
}

/**
 * Ajusta o invalida la referencia persistida según historial reciente.
 * @returns {{ since: string, resetUmbrales: boolean } | null} null = equipo recuperado (en rango)
 */
export function reconcileEpisodeReference(episode, datos, now = new Date(), rangoOpts = null) {
  const resolved = resolveAlertOutOfRangeSince(datos, now, rangoOpts);
  if (resolved == null) return null;

  const prev = parseTelemetryTimestamp(episode.since);
  const next = parseTelemetryTimestamp(resolved);
  if (Number.isNaN(prev) || Math.abs(next - prev) > 60_000) {
    return { since: resolved, resetUmbrales: true };
  }
  return { since: episode.since, resetUmbrales: false };
}

export async function fetchHistorialRango(codigo, imei, fechaInicial, fechaFinal) {
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

export async function fetchHistorialUltimasHoras(
  codigo,
  imei,
  horas = HISTORICAL_WINDOW_HOURS,
  referencia = new Date()
) {
  const fechaFinal = referencia;
  const fechaInicial = new Date(referencia.getTime() - horas * MS_HORA);
  return fetchHistorialRango(codigo, imei, fechaInicial, fechaFinal);
}

/** Timestamp ms de un registro de historial (`created_at` | `fecha`). */
export function timestampRegistroHistorial(row) {
  return timestampRegistro(row);
}

/**
 * Intervalos con equipo apagado (power_state 0), ordenados cronológicamente.
 * @returns {{ since: string, until: string | null, durationHours: number }[]}
 */
export function computeApagadoIntervals(datos, referencia = new Date()) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({
      ts: timestampRegistro(row),
      apagado: row.power_state === 0,
    }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  const intervals = [];
  let open = null;

  for (const { ts, apagado } of sorted) {
    if (apagado) {
      if (open == null) {
        open = { sinceTs: ts, sinceIso: new Date(ts).toISOString() };
      }
      continue;
    }
    if (!apagado && open != null) {
      intervals.push({
        since: open.sinceIso,
        until: new Date(ts).toISOString(),
        durationHours: Math.round(((ts - open.sinceTs) / MS_HORA) * 1000) / 1000,
      });
      open = null;
    }
  }

  if (open != null) {
    const untilTs = referencia.getTime();
    intervals.push({
      since: open.sinceIso,
      until: null,
      durationHours: Math.round(((untilTs - open.sinceTs) / MS_HORA) * 1000) / 1000,
    });
  }

  return intervals;
}

export function horasDesdeReferencia(sinceIso, now = new Date()) {
  const start = parseTelemetryTimestamp(sinceIso);
  if (Number.isNaN(start)) return 0;
  const end = now instanceof Date ? now.getTime() : parseTelemetryTimestamp(now);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, (end - start) / MS_HORA);
}

/**
 * Hasta cuándo contar horas fuera de rango/apagado.
 * No acumula tiempo después de la última telemetría recibida (evita 5 h ficticias si el equipo dejó de reportar).
 */
export function effectiveEvaluationTime(dispositivo, now = new Date()) {
  const ua = dispositivo?.ultima_actualizacion;
  if (ua == null || ua === '') return now;
  const uaDate = parseTelemetryDate(ua);
  if (Number.isNaN(uaDate.getTime())) return now;
  const nowMs = now instanceof Date ? now.getTime() : parseTelemetryTimestamp(now);
  return uaDate.getTime() <= nowMs ? uaDate : now;
}

/** Horas desde referencia hasta la última comunicación efectiva del equipo. */
export function horasDesdeReferenciaEquipo(dispositivo, sinceIso, now = new Date()) {
  return horasDesdeReferencia(sinceIso, effectiveEvaluationTime(dispositivo, now));
}

export function horasEnterasDesdeReferenciaEquipo(dispositivo, sinceIso, now = new Date()) {
  return Math.floor(horasDesdeReferenciaEquipo(dispositivo, sinceIso, now));
}

export function horasEnterasDesdeReferencia(sinceIso, now = new Date()) {
  return Math.floor(horasDesdeReferencia(sinceIso, now));
}

/**
 * Horas del episodio activas en el día calendario GMT-5 actual.
 * Usado para reiniciar umbrales (30 min, 1 h, 2 h…) cada medianoche.
 */
export function horasEnDiaCalendario(sinceIso, dispositivo, now = new Date()) {
  const evalTime = effectiveEvaluationTime(dispositivo, now);
  const evalMs = evalTime instanceof Date ? evalTime.getTime() : parseTelemetryTimestamp(evalTime);
  const sinceMs = parseTelemetryTimestamp(sinceIso);
  if (Number.isNaN(sinceMs) || Number.isNaN(evalMs)) return 0;
  const dayStartMs = startOfDayMs(now);
  const intervalStart = Math.max(sinceMs, dayStartMs);
  if (evalMs <= intervalStart) return 0;
  return Math.round(((evalMs - intervalStart) / MS_HORA) * 100) / 100;
}

/** Ventana de trazabilidad adjunta a correos de alerta. */
export const TRACEABILITY_WINDOW_HOURS = 3;

const MS_30MIN = 30 * 60 * 1000;

function mapRowToPunto(row, ts) {
  const fechaRaw = row.created_at ?? row.fecha ?? null;
  return {
    ts,
    fecha: fechaRaw,
    hora: formatTimeShortTz(fechaRaw ?? new Date(ts).toISOString()),
    horaCompleta: formatChartAxisLabel(fechaRaw ?? new Date(ts).toISOString()),
    setPoint: row.set_point ?? null,
    returnAir: row.return_air ?? null,
    tempSupply: row.temp_supply_1 ?? null,
    evaporatorCoil: row.evaporation_coil ?? null,
    powerState: row.power_state ?? null,
    enRango: row.en_rango ?? null,
  };
}

function findClosestPoint(sorted, targetTs) {
  if (sorted.length === 0) return null;
  let best = sorted[0];
  let bestDiff = Math.abs(best.ts - targetTs);
  for (const item of sorted) {
    const diff = Math.abs(item.ts - targetTs);
    if (diff < bestDiff) {
      best = item;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Puntos de telemetría 3 h para correo.
 * - puntosTabla: ~cada 30 min desde el último registro hacia atrás (más reciente primero)
 * - puntosGrafico: serie completa ascendente para la gráfica
 */
export function prepareHistorialTrazabilidad(
  datos,
  referencia = new Date(),
  ventanaHoras = TRACEABILITY_WINDOW_HOURS
) {
  const cutoff = referencia.getTime() - ventanaHoras * MS_HORA;
  const sorted = [...(datos ?? [])]
    .map((row) => ({ row, ts: timestampRegistro(row) }))
    .filter(({ ts }) => !Number.isNaN(ts) && ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) {
    return {
      ventanaHoras,
      generadoAt: referencia.toISOString(),
      puntosTabla: [],
      puntosGrafico: [],
      puntos: [],
    };
  }

  const puntosGrafico = sorted.map(({ row, ts }) => mapRowToPunto(row, ts));

  const seen = new Set();
  const puntosTabla = [];
  let targetTs = sorted[sorted.length - 1].ts;
  while (targetTs >= cutoff) {
    const closest = findClosestPoint(sorted, targetTs);
    if (closest != null && !seen.has(closest.ts)) {
      seen.add(closest.ts);
      puntosTabla.push(mapRowToPunto(closest.row, closest.ts));
    }
    targetTs -= MS_30MIN;
  }
  puntosTabla.sort((a, b) => b.ts - a.ts);

  return {
    ventanaHoras,
    generadoAt: referencia.toISOString(),
    puntosTabla,
    puntosGrafico,
    /** @deprecated usar puntosTabla */
    puntos: puntosTabla,
  };
}
