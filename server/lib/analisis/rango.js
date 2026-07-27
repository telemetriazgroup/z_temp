import { filaDefrostEfectivo } from '../powerState.js';
import {
  computeRangoLimites,
  getMargenesSetpoint,
  toleranciaSetpointDefault,
} from '../rangoTemperatura.js';
import { resolveRangoOptsForDevice } from '../deviceAlertConfigRepository.js';
import { rowEnRangoParaAlerta } from '../historicalTelemetry.js';

/** Apagados menores a esto se consideran falso apagado (no entran al análisis). */
export const MIN_APAGADO_MS = 6 * 60 * 1000;

/**
 * Fuera de rango menores a 30 minutos no se muestran ni suman en el análisis
 * (transitorios / ruido). Solo episodios ≥ 30 min.
 */
export const MIN_FUERA_RANGO_MS = 30 * 60 * 1000;

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
 * En rango para análisis mensual: banda fija del informe si existe;
 * si no, misma lógica que alertas (return_air vs set_point ± márgenes).
 */
export function rowEnRangoParaAnalisis(row, rangoOpts = null) {
  if (row == null) return null;
  if (row.power_state === 0) return null;
  if (filaDefrostEfectivo(row)) return true;

  const ret = row.return_air;
  if (ret == null || Number.isNaN(Number(ret))) return null;

  if (
    rangoOpts?.useBandaFija &&
    rangoOpts.bandaMin != null &&
    rangoOpts.bandaMax != null
  ) {
    return Number(ret) >= rangoOpts.bandaMin && Number(ret) <= rangoOpts.bandaMax;
  }

  return rowEnRangoParaAlerta(row, rangoOpts);
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

/** Separa apagados reales (≥ 6 min) de falsos apagados. */
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
 * Separa fuera de rango reales (≥ 30 min) de episodios cortos descartados.
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
