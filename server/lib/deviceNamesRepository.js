import { readJson, writeJson } from './store.js';

/** Mapa imei → nombre reconocido por el cliente. */
function readByImei() {
  return readJson('deviceNames.json', {});
}

export function getDeviceNameByImei(imei) {
  if (!imei) return null;
  const map = readByImei();
  const name = map[imei]?.trim();
  return name || null;
}

export function mergeDeviceNames(entries) {
  if (!entries || typeof entries !== 'object') return readByImei();
  const current = readByImei();
  let changed = false;
  for (const [imei, name] of Object.entries(entries)) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!imei || !trimmed || trimmed === 'SIN ASIGNAR') continue;
    if (current[imei] !== trimmed) {
      current[imei] = trimmed;
      changed = true;
    }
  }
  if (changed) writeJson('deviceNames.json', current);
  return current;
}
