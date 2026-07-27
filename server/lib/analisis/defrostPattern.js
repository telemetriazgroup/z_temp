import { timestampRegistroHistorial } from '../historicalTelemetry.js';
import { parseTelemetryTimestamp } from '../timezone.js';
import { intervalDurationMinutes } from './rango.js';

/** Ciclo de defrost: duración máxima típica (no auto-clasificar por encima). */
export const MAX_DEFROST_MS = 60 * 60 * 1000;

/**
 * Patrón térmico de defrost (ver `historial_defrost.csv`):
 * - El evaporador sube más que retorno y suministro (cerca de la resistencia).
 * - El evaporador asciende claramente durante el episodio.
 * - Duración del evento < 60 min.
 *
 * Ejemplo 13/07/2026 ~16:00–16:33 (SP -20):
 * Evap pasa de ~-8.5 a +24.3 mientras suministro se mantiene ~-7…-17
 * y retorno también sube, generando “fuera de rango” aparente.
 */

function pointsInInterval(datos, sinceIso, untilIso) {
  const from = parseTelemetryTimestamp(sinceIso);
  const to = parseTelemetryTimestamp(untilIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return [];

  return [...(datos ?? [])]
    .map((row) => {
      const ts = timestampRegistroHistorial(row);
      const supply = row.temp_supply_1;
      const ret = row.return_air;
      const evap = row.evaporation_coil;
      if (Number.isNaN(ts) || ts < from || ts > to) return null;
      if (
        supply == null ||
        Number.isNaN(Number(supply)) ||
        ret == null ||
        Number.isNaN(Number(ret)) ||
        evap == null ||
        Number.isNaN(Number(evap))
      ) {
        return null;
      }
      return {
        ts,
        supply: Number(supply),
        ret: Number(ret),
        evap: Number(evap),
        enDefrost: row.en_defrost === true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

/**
 * ¿El intervalo cerrado parece un defrost por patrón térmico?
 * @returns {{ match: boolean, reason?: string, metrics?: object }}
 */
export function evaluateDefrostPattern(datos, sinceIso, untilIso) {
  if (untilIso == null) {
    return { match: false, reason: 'intervalo_abierto' };
  }

  const durationMin = intervalDurationMinutes(sinceIso, untilIso);
  if (durationMin <= 0 || durationMin > 60) {
    return { match: false, reason: 'duracion_fuera_de_ventana_defrost', metrics: { durationMin } };
  }

  const points = pointsInInterval(datos, sinceIso, untilIso);
  if (points.length < 2) {
    return { match: false, reason: 'pocos_puntos', metrics: { n: points.length } };
  }

  // Flag telemetría: si varios puntos traen en_defrost, es señal fuerte.
  const flagged = points.filter((p) => p.enDefrost).length;
  if (flagged >= Math.max(1, Math.floor(points.length * 0.3))) {
    return {
      match: true,
      reason: 'flag_en_defrost',
      metrics: { durationMin, flagged, n: points.length },
    };
  }

  const peakEvapOverBoth = points.filter(
    (p) => p.evap > p.ret && p.evap > p.supply
  );
  if (peakEvapOverBoth.length === 0) {
    return { match: false, reason: 'evap_no_supera_retorno_y_suministro' };
  }

  const firstEvap = points[0].evap;
  const maxEvap = Math.max(...points.map((p) => p.evap));
  const maxSupply = Math.max(...points.map((p) => p.supply));
  const rise = maxEvap - firstEvap;
  const evapOverSupply = maxEvap - maxSupply;

  // Subida del evaporador y separación clara respecto al suministro (resistencia).
  if (rise < 5) {
    return { match: false, reason: 'evap_sin_subida', metrics: { rise, maxEvap, firstEvap } };
  }
  if (evapOverSupply < 3) {
    return {
      match: false,
      reason: 'evap_no_destaca_sobre_suministro',
      metrics: { evapOverSupply, maxEvap, maxSupply },
    };
  }

  return {
    match: true,
    reason: 'patron_termico_defrost',
    metrics: {
      durationMin,
      n: points.length,
      peakSamples: peakEvapOverBoth.length,
      rise: Math.round(rise * 10) / 10,
      evapOverSupply: Math.round(evapOverSupply * 10) / 10,
      maxEvap,
    },
  };
}

export function isDefrostPattern(datos, sinceIso, untilIso) {
  return evaluateDefrostPattern(datos, sinceIso, untilIso).match === true;
}

/**
 * Sobre intervalos fuera de rango:
 * - patrón defrost + duración ≤ 60 min → se conservan con clasificacion defrost
 *   (aunque sean < 30 min; no se descartan como “cortos”)
 * - sin patrón: se aplica umbral mínimo de fuera de rango (reales vs cortos)
 */
export function classifyFueraIntervalsWithDefrost(
  intervals,
  datos,
  { minFueraMs, openEnd = Date.now() } = {}
) {
  const defrost = [];
  const fueraReales = [];
  const cortos = [];

  for (const i of intervals ?? []) {
    const until = i.until;
    const ms =
      (until == null ? openEnd : new Date(until).getTime()) -
      new Date(i.since).getTime();
    const evalDefrost =
      until != null ? evaluateDefrostPattern(datos, i.since, until) : { match: false };

    if (evalDefrost.match && ms > 0 && ms <= MAX_DEFROST_MS) {
      defrost.push({
        ...i,
        clasificacion: 'defrost',
        detalle:
          'Clasificación automática: patrón térmico de defrost (evaporador > retorno y suministro; duración ≤ 60 min).',
        defrostMetrics: evalDefrost.metrics,
      });
      continue;
    }

    if (ms >= minFueraMs) {
      fueraReales.push(i);
    } else {
      cortos.push(i);
    }
  }

  return { defrost, fueraReales, cortos };
}
