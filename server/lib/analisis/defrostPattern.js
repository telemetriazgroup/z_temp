import { timestampRegistroHistorial } from '../historicalTelemetry.js';
import { parseTelemetryTimestamp } from '../timezone.js';
import { intervalDurationMinutes } from './rango.js';
import { subtractIntervals } from './gaps.js';
import { formatDefrostAnalisis, analisisFueraRango, analisisFalsoFuera } from './decisionAnalisis.js';

/** Ciclo de defrost: duración máxima típica (no auto-clasificar por encima). */
export const MAX_DEFROST_MS = 60 * 60 * 1000;

/** Duración mínima de un segmento defrost embebido en un fuera largo. */
export const MIN_DEFROST_SEGMENT_MS = 5 * 60 * 1000;

/**
 * Separación mínima del evaporador respecto a retorno/suministro en el pico (°C).
 * En fuera real (`si_fuera_de_rango.csv`) el evap puede ir un poco por encima del
 * retorno (~0–1 °C) sin ser defrost. En defrost la separación es categórica
 * (p. ej. evap 24.9 vs ret 15.7 / supply 9.5).
 */
export const DEFROST_MIN_EVAP_OVER_RET = 4;
export const DEFROST_MIN_EVAP_OVER_SUPPLY = 8;
/** Subida mínima del evap desde el valle (bajada previa) hasta el pico (°C). */
export const DEFROST_MIN_RISE_FROM_DIP = 8;
/**
 * Tras el pico, el evaporador debe bajar (máquina vuelve a enfriar).
 * Si se queda estable (p. ej. `falso_defrost.csv`) → fuera de rango, no DEFROST.
 */
export const DEFROST_MAX_MS_AFTER_PEAK_TO_DROP = 5 * 60 * 1000;
export const DEFROST_MIN_DROP_AFTER_PEAK = 3;
/** Si el evap permanece cerca del pico más de esto → meseta, no defrost. */
export const DEFROST_STABLE_NEAR_PEAK_C = 1.5;

/**
 * Patrón térmico de defrost:
 * 1) Evaporador suele bajar un poco.
 * 2) Luego sube con fuerza hasta superar claramente suministro y retorno.
 * 3) Tras el pico, baja con pendiente (en ≤ 5 min) — la máquina vuelve a enfriar.
 *
 * Referencias:
 * - `historial_defrost.csv` / `historial_fuera_de ran.csv` → SÍ defrost (pico ~25 °C y bajada).
 * - `si_fuera_de_rango.csv` → fuera real: sin pico categórico.
 * - `falso_defrost.csv` → evap sube y se queda estable → fuera de rango (no DEFROST).
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
 * Núcleo de resistencia: evaporador se separa de forma significativa de retorno y suministro.
 * No basta con ir “un poco” por encima (eso ocurre en fuera de rango normal).
 */
export function isLikelyDefrostPoint(p) {
  if (p?.enDefrost === true) return true;
  if (p == null) return false;
  return (
    p.evap >= p.ret + DEFROST_MIN_EVAP_OVER_RET &&
    p.evap >= p.supply + DEFROST_MIN_EVAP_OVER_SUPPLY
  );
}

/**
 * Forma característica: valle → pico significativo → bajada (enfriamiento).
 * @returns {{ match: boolean, reason?: string, metrics?: object }}
 */
export function evaluateDefrostShape(points) {
  if (!points || points.length < 3) {
    return { match: false, reason: 'pocos_puntos', metrics: { n: points?.length ?? 0 } };
  }

  let peakIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].evap > points[peakIdx].evap) peakIdx = i;
  }
  const peak = points[peakIdx];
  const maxEvap = peak.evap;
  const overRet = maxEvap - peak.ret;
  const overSupply = maxEvap - peak.supply;

  if (overRet < DEFROST_MIN_EVAP_OVER_RET) {
    return {
      match: false,
      reason: 'separacion_evap_retorno_no_significativa',
      metrics: { overRet, maxEvap, peakRet: peak.ret },
    };
  }
  if (overSupply < DEFROST_MIN_EVAP_OVER_SUPPLY) {
    return {
      match: false,
      reason: 'separacion_evap_suministro_no_significativa',
      metrics: { overSupply, maxEvap, peakSupply: peak.supply },
    };
  }

  // Valle antes del pico (el evap suele bajar un poco y luego dispararse).
  const before = points.slice(0, peakIdx + 1);
  const minBefore = Math.min(...before.map((p) => p.evap));
  const riseFromDip = maxEvap - minBefore;
  if (riseFromDip < DEFROST_MIN_RISE_FROM_DIP) {
    return {
      match: false,
      reason: 'sin_subida_desde_valle',
      metrics: { riseFromDip, maxEvap, minBefore },
    };
  }

  // Pico no debe ser el primer ni el último punto (hace falta rampa y bajada).
  if (peakIdx < 1) {
    return { match: false, reason: 'pico_sin_rampa_previa', metrics: { peakIdx } };
  }
  if (peakIdx >= points.length - 1) {
    return {
      match: false,
      reason: 'pico_al_final_sin_bajada',
      metrics: { peakIdx, maxEvap },
    };
  }

  // Obligatorio: bajada tras el pico en ≤ 5 min (máquina vuelve a enfriar).
  // Si el evap se queda en meseta → fuera de rango (falso_defrost), no DEFROST.
  const peakTs = peak.ts;
  const dropDeadline = peakTs + DEFROST_MAX_MS_AFTER_PEAK_TO_DROP;
  const afterPoints = points.slice(peakIdx + 1);
  const inDropWindow = afterPoints.filter((p) => p.ts <= dropDeadline);
  const afterAll = afterPoints;

  if (inDropWindow.length === 0 && afterAll.length === 0) {
    return {
      match: false,
      reason: 'sin_muestras_tras_pico',
      metrics: { maxEvap },
    };
  }

  // Meseta: permanece cerca del pico más de 5 min.
  let lastNearPeakTs = peakTs;
  for (const p of afterAll) {
    if (maxEvap - p.evap <= DEFROST_STABLE_NEAR_PEAK_C) {
      lastNearPeakTs = p.ts;
    } else {
      break;
    }
  }
  const stableNearPeakMs = lastNearPeakTs - peakTs;
  if (stableNearPeakMs > DEFROST_MAX_MS_AFTER_PEAK_TO_DROP) {
    return {
      match: false,
      reason: 'evap_meseta_sin_bajada',
      metrics: {
        maxEvap,
        stableNearPeakMin: Math.round((stableNearPeakMs / 60000) * 10) / 10,
      },
    };
  }

  const windowForDrop =
    inDropWindow.length > 0 ? inDropWindow : afterAll.slice(0, 3);
  const minAfter = Math.min(...windowForDrop.map((p) => p.evap));
  const dropAfter = maxEvap - minAfter;
  const dropAt = windowForDrop.reduce(
    (best, p) => (p.evap <= minAfter ? p : best),
    windowForDrop[0]
  );
  const dropDelayMs = dropAt.ts - peakTs;

  if (dropAfter < DEFROST_MIN_DROP_AFTER_PEAK) {
    return {
      match: false,
      reason: 'bajada_post_pico_insuficiente',
      metrics: {
        dropAfter,
        dropDelayMin: Math.round((dropDelayMs / 60000) * 10) / 10,
        maxEvap,
        minAfter,
      },
    };
  }
  if (dropDelayMs > DEFROST_MAX_MS_AFTER_PEAK_TO_DROP) {
    return {
      match: false,
      reason: 'bajada_post_pico_tarde',
      metrics: {
        dropAfter,
        dropDelayMin: Math.round((dropDelayMs / 60000) * 10) / 10,
      },
    };
  }

  const coreMarked = points.filter(isLikelyDefrostPoint).length;
  if (coreMarked < 1) {
    return {
      match: false,
      reason: 'sin_puntos_nucleo_significativos',
      metrics: { coreMarked },
    };
  }

  return {
    match: true,
    reason: 'patron_dip_pico_bajada',
    metrics: {
      n: points.length,
      peakIdx,
      maxEvap,
      overRet: Math.round(overRet * 10) / 10,
      overSupply: Math.round(overSupply * 10) / 10,
      riseFromDip: Math.round(riseFromDip * 10) / 10,
      dropAfter: Math.round(dropAfter * 10) / 10,
      dropDelayMin: Math.round((dropDelayMs / 60000) * 10) / 10,
      coreMarked,
    },
  };
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
  if (points.length < 3) {
    return { match: false, reason: 'pocos_puntos', metrics: { n: points.length } };
  }

  const flagged = points.filter((p) => p.enDefrost).length;
  if (flagged >= Math.max(1, Math.floor(points.length * 0.3))) {
    return {
      match: true,
      reason: 'flag_en_defrost',
      metrics: { durationMin, flagged, n: points.length },
    };
  }

  const shape = evaluateDefrostShape(points);
  if (!shape.match) {
    return { ...shape, metrics: { ...shape.metrics, durationMin } };
  }

  return {
    match: true,
    reason: shape.reason,
    metrics: { durationMin, ...shape.metrics },
  };
}

export function isDefrostPattern(datos, sinceIso, untilIso) {
  return evaluateDefrostPattern(datos, sinceIso, untilIso).match === true;
}

/**
 * Localiza segmentos de defrost dentro de un intervalo (p. ej. fuera largo).
 * Solo acepta tramos con separación categórica y forma valle→pico→bajada.
 *
 * @returns {{ since: string, until: string, durationHours: number, metrics?: object }[]}
 */
export function findDefrostSegmentsInInterval(datos, sinceIso, untilIso) {
  if (untilIso == null) return [];
  const points = pointsInInterval(datos, sinceIso, untilIso);
  if (points.length < 3) return [];

  const marked = points.map((p) => isLikelyDefrostPoint(p));
  const runs = [];
  let start = -1;
  for (let i = 0; i < marked.length; i += 1) {
    if (marked[i] && start < 0) start = i;
    if ((!marked[i] || i === marked.length - 1) && start >= 0) {
      const end = marked[i] && i === marked.length - 1 ? i : i - 1;
      if (end >= start) runs.push([start, end]);
      start = -1;
    }
  }

  const merged = [];
  for (const run of runs) {
    if (merged.length === 0) {
      merged.push([...run]);
      continue;
    }
    const prev = merged[merged.length - 1];
    const gap = points[run[0]].ts - points[prev[1]].ts;
    if (gap <= 6 * 60 * 1000) {
      prev[1] = run[1];
    } else {
      merged.push([...run]);
    }
  }

  const segments = [];
  for (const [i0, i1] of merged) {
    let lo = i0;
    let hi = i1;

    // Rampa de subida desde el valle inmediato (evap bajó y luego sube al pico).
    while (lo > 0) {
      const prev = points[lo - 1];
      const cur = points[lo];
      if (cur.ts - prev.ts > 8 * 60 * 1000) break;
      if (prev.evap < cur.evap) {
        lo -= 1;
        continue;
      }
      // Incluir el valle (mínimo local) y detenerse: más atrás ya es otro régimen.
      lo -= 1;
      break;
    }
    // Bajada tras el pico hasta que el evap deja de destacar.
    while (hi < points.length - 1) {
      const cur = points[hi];
      const next = points[hi + 1];
      if (next.ts - cur.ts > 8 * 60 * 1000) break;
      if (points[hi].ts - points[lo].ts >= MAX_DEFROST_MS) break;
      if (next.evap <= cur.evap + 0.3) {
        hi += 1;
        if (!isLikelyDefrostPoint(next) && next.evap <= next.ret + 2) {
          break;
        }
        continue;
      }
      break;
    }

    let sinceTs = points[lo].ts;
    let untilTs = points[hi].ts;
    let dur = untilTs - sinceTs;
    if (dur < MIN_DEFROST_SEGMENT_MS) continue;
    if (dur > MAX_DEFROST_MS) {
      const peakIdx =
        lo +
        points
          .slice(lo, hi + 1)
          .reduce((best, p, idx, arr) => (p.evap > arr[best].evap ? idx : best), 0);
      const half = Math.floor(MAX_DEFROST_MS / 2);
      sinceTs = Math.max(points[lo].ts, points[peakIdx].ts - half);
      untilTs = Math.min(points[hi].ts, sinceTs + MAX_DEFROST_MS);
      const inWin = points.filter((p) => p.ts >= sinceTs && p.ts <= untilTs);
      if (inWin.length < 3) continue;
      sinceTs = inWin[0].ts;
      untilTs = inWin[inWin.length - 1].ts;
      dur = untilTs - sinceTs;
    }

    const since = new Date(sinceTs).toISOString();
    const until = new Date(untilTs).toISOString();
    const evalSeg = evaluateDefrostPattern(datos, since, until);
    if (!evalSeg.match) continue;
    if (dur < MIN_DEFROST_SEGMENT_MS || dur > MAX_DEFROST_MS) continue;

    segments.push({
      since,
      until,
      durationHours: Math.round((dur / 3600000) * 1000) / 1000,
      metrics: evalSeg.metrics,
    });
  }

  return segments;
}

function toDefrostEvent(seg) {
  return {
    since: seg.since,
    until: seg.until,
    durationHours: seg.durationHours,
    clasificacion: 'defrost',
    detalle:
      'Clasificación automática: DEFROST (evaporador baja, luego pico categórico sobre retorno/suministro y baja; ≤ 60 min). No suma como fuera de rango.',
    analisis: formatDefrostAnalisis(seg.metrics),
    defrostMetrics: seg.metrics,
  };
}

/**
 * Sobre intervalos fuera de rango:
 * - patrón defrost + duración ≤ 60 min → evento DEFROST completo
 * - fuera largo con defrost embebido → parte en fuera | DEFROST | fuera
 *   (los minutos de defrost no inflan fuera de rango)
 * - sin patrón: umbral ≥ 20 min; fragmentos cortos → cortos/falso_fuera (admin)
 */
export function classifyFueraIntervalsWithDefrost(
  intervals,
  datos,
  { minFueraMs, openEnd = Date.now() } = {}
) {
  const defrost = [];
  const fueraReales = [];
  const cortos = [];

  const pushFueraOrCorto = (piece, note, opts = {}) => {
    const until = piece.until;
    const ms =
      (until == null ? openEnd : new Date(until).getTime()) -
      new Date(piece.since).getTime();
    if (ms <= 0) return;
    const durationMinutes = Math.round((ms / 60000) * 10) / 10;
    // Seguridad: nunca etiquetar como “corto” un episodio ≥ umbral (p. ej. > 20 min).
    if (ms >= minFueraMs) {
      fueraReales.push({
        ...piece,
        detalle: piece.detalle ?? note ?? null,
        analisis:
          piece.analisis ??
          analisisFueraRango({
            recortadoPorApagadoOSinTx:
              piece.truncatedByMask === true && !opts.partidoPorDefrost,
            partidoPorDefrost: opts.partidoPorDefrost === true,
          }),
      });
    } else {
      cortos.push({
        ...piece,
        detalle:
          piece.detalle ??
          (note ??
            'Fuera de rango < 20 min (transitorio; no se muestra al cliente).'),
        analisis:
          piece.analisis ??
          analisisFalsoFuera(durationMinutes, note ?? null),
      });
    }
  };

  for (const i of intervals ?? []) {
    const until = i.until;
    const ms =
      (until == null ? openEnd : new Date(until).getTime()) -
      new Date(i.since).getTime();

    if (until != null && ms > 0 && ms <= MAX_DEFROST_MS) {
      const evalDefrost = evaluateDefrostPattern(datos, i.since, until);
      if (evalDefrost.match) {
        defrost.push({
          ...i,
          clasificacion: 'defrost',
          detalle:
            'Clasificación automática: patrón DEFROST (valle → pico significativo del evaporador sobre retorno/suministro → bajada; ≤ 60 min).',
          analisis: formatDefrostAnalisis(evalDefrost.metrics),
          defrostMetrics: evalDefrost.metrics,
        });
        continue;
      }
    }

    // Fuera largo (o sin match global): buscar defrost embebido y partir.
    if (until != null && ms > MIN_DEFROST_SEGMENT_MS) {
      const segments = findDefrostSegmentsInInterval(datos, i.since, until);
      if (segments.length > 0) {
        for (const seg of segments) {
          defrost.push(toDefrostEvent(seg));
        }
        const remnants = subtractIntervals([i], segments, openEnd);
        for (const r of remnants) {
          pushFueraOrCorto(
            { ...r, truncatedByMask: true },
            'Fuera de rango partido: se extrajo el tramo DEFROST intermedio.',
            { partidoPorDefrost: true }
          );
        }
        continue;
      }
    }

    pushFueraOrCorto(
      i,
      i.truncatedByMask === true
        ? 'Fuera de rango recortado: no se solapa con apagado ni con sin transmisión.'
        : null,
      {
        recortadoPorApagadoOSinTx: i.truncatedByMask === true,
      }
    );
  }

  return { defrost, fueraReales, cortos };
}
