import {
  computeRangoLimites,
  getMargenesSetpoint,
  toleranciaSetpointDefault,
} from '../rangoTemperatura.js';
import { resolveRangoOptsForDevice } from '../deviceAlertConfigRepository.js';
import { timestampRegistroHistorial } from '../historicalTelemetry.js';

/** Apagados menores a esto se consideran falso apagado (no entran al análisis). */
export const MIN_APAGADO_MS = 8 * 60 * 1000;

/**
 * Si |suministro − set_point| ≤ este margen (°C), un power_state=0 se trata como
 * falso apagado: el equipo está manteniendo temperatura (sigue “encendido” térmicamente).
 */
export const SUMINISTRO_CERCA_SETPOINT_C = 2;

/**
 * Fuera de rango menores a 20 minutos no se muestran ni suman en el análisis
 * (transitorios / ruido). Solo episodios ≥ 20 min.
 */
export const MIN_FUERA_RANGO_MS = 20 * 60 * 1000;

/**
 * Normaliza el rango que enviará el cliente para el análisis del mes.
 * Acepta banda absoluta (min/max) o márgenes alrededor del set point.
 */
export function buildAnalisisRangoSnapshot(input = {}, setPointFallback = null) {
  const setPointRaw =
    input.setPoint != null && input.setPoint !== ''
      ? Number(input.setPoint)
      : setPointFallback != null
        ? Number(setPointFallback)
        : null;
  const setPoint =
    setPointRaw != null && !Number.isNaN(setPointRaw) ? setPointRaw : null;

  let bandaMin =
    input.bandaMin != null && input.bandaMin !== ''
      ? Number(input.bandaMin)
      : null;
  let bandaMax =
    input.bandaMax != null && input.bandaMax !== ''
      ? Number(input.bandaMax)
      : null;

  let margenInferior =
    input.margenInferior != null && input.margenInferior !== ''
      ? Math.max(0, Number(input.margenInferior))
      : null;
  let margenSuperior =
    input.margenSuperior != null && input.margenSuperior !== ''
      ? Math.max(0, Number(input.margenSuperior))
      : null;

  if (
    setPoint != null &&
    bandaMin != null &&
    !Number.isNaN(bandaMin) &&
    bandaMax != null &&
    !Number.isNaN(bandaMax)
  ) {
    if (bandaMax < bandaMin) {
      const tmp = bandaMin;
      bandaMin = bandaMax;
      bandaMax = tmp;
    }
    margenInferior = Math.max(0, Math.round((setPoint - bandaMin) * 100) / 100);
    margenSuperior = Math.max(0, Math.round((bandaMax - setPoint) * 100) / 100);
  } else if (setPoint != null) {
    if (margenInferior == null || Number.isNaN(margenInferior)) {
      margenInferior = toleranciaSetpointDefault(setPoint);
    }
    if (margenSuperior == null || Number.isNaN(margenSuperior)) {
      margenSuperior = toleranciaSetpointDefault(setPoint);
    }
    bandaMin = setPoint - margenInferior;
    bandaMax = setPoint + margenSuperior;
  }

  const usePersonalizado =
    input.useRangoPersonalizado === true ||
    (bandaMin != null && bandaMax != null);

  const snapshot = {
    useRangoPersonalizado: Boolean(usePersonalizado),
    setPoint,
    bandaMin: bandaMin != null && !Number.isNaN(bandaMin) ? bandaMin : null,
    bandaMax: bandaMax != null && !Number.isNaN(bandaMax) ? bandaMax : null,
    margenInferior:
      margenInferior != null && !Number.isNaN(margenInferior)
        ? margenInferior
        : null,
    margenSuperior:
      margenSuperior != null && !Number.isNaN(margenSuperior)
        ? margenSuperior
        : null,
  };

  return snapshot;
}

/** Opciones para el motor de evaluación (alertas / banda fija del análisis). */
export function rangoOptsFromSnapshot(snapshot) {
  if (snapshot == null) return null;
  if (snapshot.bandaMin != null && snapshot.bandaMax != null) {
    return {
      useRangoPersonalizado: true,
      useBandaFija: true,
      bandaMin: snapshot.bandaMin,
      bandaMax: snapshot.bandaMax,
      margenInferior: snapshot.margenInferior ?? 0.5,
      margenSuperior: snapshot.margenSuperior ?? 0.5,
      setPoint: snapshot.setPoint,
    };
  }
  if (snapshot.useRangoPersonalizado) {
    return {
      useRangoPersonalizado: true,
      margenInferior: snapshot.margenInferior ?? 0.5,
      margenSuperior: snapshot.margenSuperior ?? 0.5,
      setPoint: snapshot.setPoint,
    };
  }
  return null;
}

/**
 * En rango para análisis mensual (episodio continuo de fuera de rango).
 *
 * Regla de producto: banda inclusiva sobre **return_air** (ej. −10…5):
 * - 4.7 → en rango; 6.5 → fuera; …; 4.9 → vuelve a en rango.
 * El evento fuera abre en el **primer** punto fuera y cierra en el **primer**
 * punto que vuelve a estar dentro (episodio continuo).
 *
 * No se usa el flag `en_defrost` como “en rango”: el DEFROST se detecta
 * después por patrón térmico y se extrae del intervalo.
 * Equipo apagado (`power_state=0`) → sin evaluación de banda (null); el
 * apagado se trata aparte y recorta el fuera si se solapan.
 */
export function rowEnRangoParaAnalisis(row, rangoOpts = null) {
  if (row == null) return null;
  if (row.power_state === 0) return null;

  const ret = row.return_air;
  if (ret == null || Number.isNaN(Number(ret))) return null;
  const v = Number(ret);

  if (
    rangoOpts?.useBandaFija &&
    rangoOpts.bandaMin != null &&
    rangoOpts.bandaMax != null
  ) {
    return v >= Number(rangoOpts.bandaMin) && v <= Number(rangoOpts.bandaMax);
  }

  // Sin banda fija: misma guía que alertas (return_air vs set point ± márgenes),
  // pero sin tratar defrost como “en rango”.
  const setPoint = row.set_point;
  if (setPoint == null || Number.isNaN(Number(setPoint))) return null;
  const { inferior, superior } = getMargenesSetpoint(Number(setPoint), rangoOpts);
  return (
    v >= Number(setPoint) - inferior && v <= Number(setPoint) + superior
  );
}

export function resolveRangoParaRun(rowKey, rangoAnalisisInput, setPointFallback) {
  if (rangoAnalisisInput != null && typeof rangoAnalisisInput === 'object') {
    const snap = buildAnalisisRangoSnapshot(rangoAnalisisInput, setPointFallback);
    if (snap.bandaMin != null && snap.bandaMax != null) {
      return { snapshot: snap, opts: rangoOptsFromSnapshot(snap) };
    }
  }

  const deviceOpts = resolveRangoOptsForDevice(rowKey);
  if (deviceOpts != null && setPointFallback != null) {
    const limites = computeRangoLimites(setPointFallback, deviceOpts);
    const snap = buildAnalisisRangoSnapshot(
      {
        useRangoPersonalizado: true,
        setPoint: setPointFallback,
        margenInferior: deviceOpts.margenInferior,
        margenSuperior: deviceOpts.margenSuperior,
        bandaMin: limites?.min,
        bandaMax: limites?.max,
      },
      setPointFallback
    );
    return { snapshot: snap, opts: rangoOptsFromSnapshot(snap) };
  }

  if (setPointFallback != null && !Number.isNaN(Number(setPointFallback))) {
    const t = toleranciaSetpointDefault(Number(setPointFallback));
    const snap = buildAnalisisRangoSnapshot(
      {
        useRangoPersonalizado: true,
        setPoint: Number(setPointFallback),
        margenInferior: t,
        margenSuperior: t,
      },
      setPointFallback
    );
    return { snapshot: snap, opts: rangoOptsFromSnapshot(snap) };
  }

  return {
    snapshot: buildAnalisisRangoSnapshot({}, setPointFallback),
    opts: deviceOpts,
  };
}

export function describeRangoSnapshot(snapshot) {
  if (snapshot?.bandaMin != null && snapshot?.bandaMax != null) {
    const sp = snapshot.setPoint != null ? ` (SP ${snapshot.setPoint})` : '';
    return `${snapshot.bandaMin} … ${snapshot.bandaMax} °C${sp}`;
  }
  if (snapshot?.setPoint != null) {
    const { inferior, superior } = getMargenesSetpoint(snapshot.setPoint, {
      useRangoPersonalizado: snapshot.useRangoPersonalizado,
      margenInferior: snapshot.margenInferior,
      margenSuperior: snapshot.margenSuperior,
    });
    return `${snapshot.setPoint - inferior} … ${snapshot.setPoint + superior} °C (SP ${snapshot.setPoint})`;
  }
  return '—';
}

export function intervalDurationHours(sinceIso, untilIso, openEnd = Date.now()) {
  const a = new Date(sinceIso).getTime();
  const b = untilIso == null ? openEnd : new Date(untilIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round(((b - a) / 3600000) * 1000) / 1000;
}

export function intervalDurationMinutes(sinceIso, untilIso, openEnd = Date.now()) {
  const a = new Date(sinceIso).getTime();
  const b = untilIso == null ? openEnd : new Date(untilIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round(((b - a) / 60000) * 10) / 10;
}

/**
 * ¿El punto reporta apagado pero el suministro sigue cerca del set point?
 * Ej.: SP -4 y suministro -3.8 → no puede estar realmente apagado.
 */
export function suministroCercaDeSetPoint(
  row,
  margenC = SUMINISTRO_CERCA_SETPOINT_C
) {
  const sp = row?.set_point;
  const supply = row?.temp_supply_1;
  if (sp == null || Number.isNaN(Number(sp))) return false;
  if (supply == null || Number.isNaN(Number(supply))) return false;
  return Math.abs(Number(supply) - Number(sp)) <= margenC;
}

/** Apagado efectivo para análisis mensual (excluye falsos por suministro cerca del SP). */
export function filaApagadoRealParaAnalisis(row) {
  if (row?.power_state !== 0) return false;
  if (suministroCercaDeSetPoint(row)) return false;
  return true;
}

/**
 * Intervalos apagado para análisis: ignora power_state=0 si suministro ≈ set point (±2 °C).
 * También construye intervalos de falso apagado por suministro cerca del SP (trazabilidad admin).
 */
export function computeApagadoIntervalsAnalisis(datos, referencia = new Date()) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({
      ts: timestampRegistroHistorial(row),
      apagado: filaApagadoRealParaAnalisis(row),
      falsoPorSuministro:
        row?.power_state === 0 && suministroCercaDeSetPoint(row),
    }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  const intervals = [];
  const falsosSuministro = [];
  let open = null;
  let openFalso = null;
  let falsosPorSuministroPuntos = 0;

  const closeOpen = (untilTs) => {
    if (open == null) return;
    intervals.push({
      since: open.sinceIso,
      until: new Date(untilTs).toISOString(),
      durationHours:
        Math.round(((untilTs - open.sinceTs) / 3600000) * 1000) / 1000,
    });
    open = null;
  };

  const closeFalso = (untilTs) => {
    if (openFalso == null) return;
    falsosSuministro.push({
      since: openFalso.sinceIso,
      until: new Date(untilTs).toISOString(),
      durationHours:
        Math.round(((untilTs - openFalso.sinceTs) / 3600000) * 1000) / 1000,
      clasificacion: 'falso_apagado',
      detalle:
        `Falso apagado: power_state=0 pero suministro a ≤${SUMINISTRO_CERCA_SETPOINT_C} °C del set point (equipo mantiene temperatura).`,
    });
    openFalso = null;
  };

  for (const { ts, apagado, falsoPorSuministro } of sorted) {
    if (falsoPorSuministro) {
      falsosPorSuministroPuntos += 1;
      if (openFalso == null) {
        openFalso = { sinceTs: ts, sinceIso: new Date(ts).toISOString() };
      }
    } else {
      closeFalso(ts);
    }

    if (apagado) {
      if (open == null) {
        open = { sinceTs: ts, sinceIso: new Date(ts).toISOString() };
      }
      continue;
    }
    if (!apagado && open != null) {
      closeOpen(ts);
    }
  }

  const untilTs = referencia.getTime();
  if (open != null) {
    intervals.push({
      since: open.sinceIso,
      until: null,
      durationHours:
        Math.round(((untilTs - open.sinceTs) / 3600000) * 1000) / 1000,
    });
  }
  if (openFalso != null) {
    falsosSuministro.push({
      since: openFalso.sinceIso,
      until: null,
      durationHours:
        Math.round(((untilTs - openFalso.sinceTs) / 3600000) * 1000) / 1000,
      clasificacion: 'falso_apagado',
      detalle:
        `Falso apagado: power_state=0 pero suministro a ≤${SUMINISTRO_CERCA_SETPOINT_C} °C del set point (equipo mantiene temperatura).`,
    });
  }

  return { intervals, falsosPorSuministroPuntos, falsosSuministro };
}

/** Clasificaciones que no entran al cálculo operativo (solo trazabilidad admin). */
export const CLASIFICACIONES_FALSO_POSITIVO = new Set([
  'falso_apagado',
  'falso_fuera',
]);

export function esEventoFalsoPositivo(ev) {
  return CLASIFICACIONES_FALSO_POSITIVO.has(ev?.clasificacion);
}

/** Eventos visibles / sumables para monitoreo. */
export function esEventoOperativoParaMonitoreo(ev) {
  if (ev == null) return false;
  if (esEventoFalsoPositivo(ev)) return false;
  if (ev.tipo === 'sin_transmision') return false;
  return (
    ev.tipo === 'apagado' ||
    ev.tipo === 'fuera_rango' ||
    ev.clasificacion === 'defrost'
  );
}

/** Separa apagados reales (≥ 8 min) de falsos apagados por duración. */
export function partitionApagadoIntervals(intervals, openEnd = Date.now()) {
  const reales = [];
  const falsos = [];
  for (const i of intervals) {
    const ms =
      (i.until == null ? openEnd : new Date(i.until).getTime()) -
      new Date(i.since).getTime();
    const enriched = {
      ...i,
      durationHours: intervalDurationHours(i.since, i.until, openEnd),
      durationMinutes: intervalDurationMinutes(i.since, i.until, openEnd),
    };
    if (ms >= MIN_APAGADO_MS) reales.push(enriched);
    else falsos.push(enriched);
  }
  return { reales, falsos };
}

/**
 * Separa fuera de rango reales (≥ 20 min) de episodios cortos descartados.
 */
export function partitionFueraRangoIntervals(intervals, openEnd = Date.now()) {
  const reales = [];
  const cortos = [];
  for (const i of intervals) {
    const ms =
      (i.until == null ? openEnd : new Date(i.until).getTime()) -
      new Date(i.since).getTime();
    const enriched = {
      ...i,
      durationHours: intervalDurationHours(i.since, i.until, openEnd),
      durationMinutes: intervalDurationMinutes(i.since, i.until, openEnd),
    };
    if (ms >= MIN_FUERA_RANGO_MS) reales.push(enriched);
    else cortos.push(enriched);
  }
  return { reales, cortos };
}
