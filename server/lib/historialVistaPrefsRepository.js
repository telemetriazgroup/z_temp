import { readJson, writeJson } from './store.js';

const FILE = 'historialVistaPrefs.json';

function readAll() {
  const raw = readJson(FILE, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function writeAll(map) {
  writeJson(FILE, map);
}

function keyOf(username, imei) {
  return `${String(username).trim().toLowerCase()}::${String(imei).trim()}`;
}

export function getHistorialVistaPrefs(username, imei) {
  if (!username || !imei) return null;
  const all = readAll();
  return all[keyOf(username, imei)] ?? null;
}

export function saveHistorialVistaPrefs(username, entry) {
  if (!username || !entry?.imei) {
    throw new Error('username e imei son obligatorios');
  }
  const all = readAll();
  const k = keyOf(username, entry.imei);
  const saved = {
    username: String(username).trim(),
    imei: String(entry.imei).trim(),
    codigo: entry.codigo ?? null,
    preset: entry.preset ?? 'REEFER',
    chartKeys: Array.isArray(entry.chartKeys) ? entry.chartKeys.map(String) : [],
    tableKeys: Array.isArray(entry.tableKeys) ? entry.tableKeys.map(String) : [],
    labelKeys: Array.isArray(entry.labelKeys) ? entry.labelKeys.map(String) : [],
    chartColors:
      entry.chartColors &&
      typeof entry.chartColors === 'object' &&
      !Array.isArray(entry.chartColors)
        ? entry.chartColors
        : {},
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
  all[k] = saved;
  writeAll(all);
  return saved;
}
