import { readJson, writeJson } from './store.js';
import { normalizeUmbrales } from './store.js';

function readAll() {
  return readJson('deviceAlertConfig.json', {});
}

function writeAll(map) {
  writeJson('deviceAlertConfig.json', map);
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
  if (entry.mode !== 'custom') {
    delete entry.umbralesHoras;
    delete entry.referenciaManual;
    delete entry.useReferenciaManual;
  }
  if (entry.mode === 'custom' && Array.isArray(entry.umbralesHoras)) {
    entry.umbralesHoras = normalizeUmbrales(entry.umbralesHoras);
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

/** Umbrales efectivos: custom del dispositivo o los del grupo. */
export function resolveUmbralesForDevice(rowKey, grupoUmbrales) {
  const cfg = getDeviceAlertConfig(rowKey);
  if (cfg?.mode === 'custom' && cfg.umbralesHoras?.length) {
    return normalizeUmbrales(cfg.umbralesHoras);
  }
  return normalizeUmbrales(grupoUmbrales);
}
