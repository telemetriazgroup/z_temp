import { readJson, writeJson, normalizeUmbrales, UMBRAL_ALERTA_30_MIN } from './store.js';

function readAll() {
  return readJson('deviceAlertConfig.json', {});
}

function writeAll(map) {
  writeJson('deviceAlertConfig.json', map);
}

function normalizeMargen(value, fallback = 0.5) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function hasPersistedOverrides(entry) {
  if (entry.mode === 'custom') return true;
  if (entry.alerta1Hora) return true;
  if (entry.alerta30Minutos) return true;
  if (entry.useRangoPersonalizado) return true;
  return false;
}

export function getDeviceAlertConfigMap() {
  return readAll();
}

export function getDeviceAlertConfig(rowKey) {
  return readAll()[rowKey] ?? null;
}

export function saveDeviceAlertConfig(rowKey, patch) {
  const all = readAll();
  const prev = all[rowKey] ?? {};
  const entry = {
    rowKey,
    updatedAt: new Date().toISOString(),
    ...prev,
    ...patch,
  };

  entry.mode = entry.mode === 'custom' ? 'custom' : 'standard';

  if (entry.mode !== 'custom') {
    delete entry.umbralesHoras;
    delete entry.referenciaManual;
    delete entry.useReferenciaManual;
  } else if (Array.isArray(entry.umbralesHoras)) {
    entry.umbralesHoras = normalizeUmbrales(entry.umbralesHoras);
  }

  entry.alerta1Hora = Boolean(entry.alerta1Hora);
  entry.alerta30Minutos = Boolean(entry.alerta30Minutos);
  entry.useRangoPersonalizado = Boolean(entry.useRangoPersonalizado);

  if (entry.useRangoPersonalizado) {
    entry.margenInferior = normalizeMargen(entry.margenInferior ?? prev.margenInferior ?? 0.5);
    entry.margenSuperior = normalizeMargen(entry.margenSuperior ?? prev.margenSuperior ?? 0.5);
  } else {
    delete entry.margenInferior;
    delete entry.margenSuperior;
  }

  if (!hasPersistedOverrides(entry)) {
    delete all[rowKey];
    writeAll(all);
    return null;
  }

  all[rowKey] = entry;
  writeAll(all);
  return entry;
}

export function deleteDeviceAlertConfig(rowKey) {
  const all = readAll();
  if (!all[rowKey]) return false;
  delete all[rowKey];
  writeAll(all);
  return true;
}

/** Opciones de rango para evaluación en_rango efectivo. */
export function resolveRangoOptsForDevice(rowKey) {
  const cfg = getDeviceAlertConfig(rowKey);
  if (!cfg?.useRangoPersonalizado) return null;
  return {
    useRangoPersonalizado: true,
    margenInferior: cfg.margenInferior ?? 0.5,
    margenSuperior: cfg.margenSuperior ?? 0.5,
  };
}

/** Umbrales efectivos: custom del dispositivo o los del grupo; opcional alerta 1 h. */
export function resolveUmbralesForDevice(rowKey, grupoUmbrales) {
  const cfg = getDeviceAlertConfig(rowKey);
  let base;
  if (cfg?.mode === 'custom' && cfg.umbralesHoras?.length) {
    base = normalizeUmbrales(cfg.umbralesHoras);
  } else {
    base = normalizeUmbrales(grupoUmbrales);
  }
  const extras = [];
  if (cfg?.alerta30Minutos && !base.includes(UMBRAL_ALERTA_30_MIN)) {
    extras.push(UMBRAL_ALERTA_30_MIN);
  }
  if (cfg?.alerta1Hora && !base.includes(1)) {
    extras.push(1);
  }
  if (extras.length === 0) return base;
  return [...extras, ...base].sort((a, b) => a - b);
}
