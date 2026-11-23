import { readJson, writeJson, normalizeUmbrales, UMBRAL_ALERTA_30_MIN } from './store.js';
import { normalizarHora } from './coberturaHoraria.js';

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
  if (entry.ignorarFueraLineaHorario) return true;
  return false;
}

export function getDeviceAlertConfigMap() {
  return readAll();
}

export function getDeviceAlertConfig(rowKey, ownerUsername = null) {
  const cfg = readAll()[rowKey] ?? null;
  if (!cfg) return null;
  if (!ownerUsername) return cfg;
  const owner = cfg.ownerUsername?.toString().trim().toLowerCase();
  const want = String(ownerUsername).trim().toLowerCase();
  // Sin titular o titular distinto: no heredar config de un cliente anterior (mismo IMEI).
  if (!owner || owner !== want) return null;
  return cfg;
}

export function saveDeviceAlertConfig(rowKey, patch) {
  const all = readAll();
  const prev = all[rowKey] ?? {};
  const prevOwner = prev.ownerUsername?.toString().trim().toLowerCase() || '';
  const nextOwner =
    patch.ownerUsername != null
      ? String(patch.ownerUsername).trim().toLowerCase()
      : prevOwner;
  const inherit = Boolean(nextOwner) && prevOwner === nextOwner;
  const entry = {
    rowKey,
    updatedAt: new Date().toISOString(),
    ...(inherit ? prev : {}),
    ...patch,
  };

  entry.mode = entry.mode === 'custom' ? 'custom' : 'standard';

  if (patch.ownerUsername != null) {
    entry.ownerUsername = String(patch.ownerUsername).trim() || undefined;
  }

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
  entry.ignorarFueraLineaHorario = Boolean(entry.ignorarFueraLineaHorario);

  if (entry.ignorarFueraLineaHorario) {
    const desde = normalizarHora(entry.coberturaDesde);
    const hasta = normalizarHora(entry.coberturaHasta);
    if (!desde || !hasta || desde === hasta) {
      throw new Error('Indique una hora de inicio y una de fin distintas para la cobertura');
    }
    entry.coberturaDesde = desde;
    entry.coberturaHasta = hasta;
  } else {
    delete entry.coberturaDesde;
    delete entry.coberturaHasta;
  }

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
    return { rowKey, mode: 'standard', cleared: true };
  }

  all[rowKey] = entry;
  writeAll(all);
  return entry;
}

/**
 * Config visible para un actor: si hay owner distinto o sin owner, se ignora
 * (evita config pegada de un cliente anterior con el mismo IMEI).
 */
export function getDeviceAlertConfigForActor(rowKey, actorUsername) {
  if (!actorUsername) return getDeviceAlertConfig(rowKey);
  return getDeviceAlertConfig(rowKey, actorUsername);
}

export function deleteDeviceAlertConfig(rowKey) {
  const all = readAll();
  if (!all[rowKey]) return false;
  delete all[rowKey];
  writeAll(all);
  return true;
}

/**
 * Rango del equipo. Si el equipo tiene mínimo y máximo propios, esos mandan
 * sobre el ±4 del grupo. El aviso sigue yendo a los correos de ese grupo.
 */
export function resolveRangoOptsForDevice(rowKey, _ownerUsername = null) {
  const cfg = getDeviceAlertConfig(rowKey);
  if (!cfg?.useRangoPersonalizado) return null;
  return {
    useRangoPersonalizado: true,
    margenInferior: cfg.margenInferior ?? 0.5,
    margenSuperior: cfg.margenSuperior ?? 0.5,
  };
}

/** Ventana en la que el fuera de línea no se avisa al cliente. null si no está activa. */
export function coberturaFueraLineaDe(rowKey) {
  const cfg = getDeviceAlertConfig(rowKey);
  if (!cfg?.ignorarFueraLineaHorario) return null;
  const desde = normalizarHora(cfg.coberturaDesde);
  const hasta = normalizarHora(cfg.coberturaHasta);
  if (!desde || !hasta || desde === hasta) return null;
  return { desde, hasta };
}

/** Umbrales del equipo si los tiene; si no, los del grupo. El 30 min y la 1 h del equipo se suman. */
export function resolveUmbralesForDevice(rowKey, grupoUmbrales, _ownerUsername = null) {
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
