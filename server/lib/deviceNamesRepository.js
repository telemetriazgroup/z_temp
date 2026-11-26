import { readJson, writeJson, uid } from './store.js';

const NAMES_FILE = 'deviceNames.json';
const HISTORY_FILE = 'deviceNameHistory.json';
const MAX_HISTORY = 500;

function normalizeName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed === 'SIN ASIGNAR') return null;
  return trimmed;
}

function readStore() {
  const raw = readJson(NAMES_FILE, {});
  if (raw.byRowKey != null || raw.byImei != null) {
    return {
      byRowKey: raw.byRowKey ?? {},
      byImei: raw.byImei ?? {},
      ambiguousImeis: raw.ambiguousImeis ?? {},
    };
  }

  /** Migración: mapa plano imei → nombre (formato anterior). */
  const byImei = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      const name = normalizeName(value);
      if (name) byImei[key] = name;
    }
  }
  return { byRowKey: {}, byImei, ambiguousImeis: {} };
}

function writeStore(store) {
  writeJson(NAMES_FILE, store);
}

function readHistory() {
  const all = readJson(HISTORY_FILE, []);
  return Array.isArray(all) ? all : [];
}

function writeHistory(entries) {
  writeJson(HISTORY_FILE, entries.slice(0, MAX_HISTORY));
}

function entryName(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return normalizeName(entry);
  return normalizeName(entry.name);
}

/** IMEI de una ficha guardada. El rowKey es `CODIGO-imei` o el imei solo. */
function imeiDeEntrada(rowKey, entry) {
  if (entry?.imei) return String(entry.imei);
  const dash = String(rowKey).indexOf('-');
  return dash >= 0 ? String(rowKey).slice(dash + 1) : String(rowKey);
}

function rowKeysDelImei(store, imei) {
  if (!imei) return [];
  const keys = [];
  for (const [rowKey, entry] of Object.entries(store.byRowKey)) {
    if (imeiDeEntrada(rowKey, entry) === imei) keys.push(rowKey);
  }
  return keys;
}

/**
 * `byImei` solo refleja un nombre cuando hay una sola ficha.
 * STARCOOL y THERMOKING con el mismo IMEI no comparten ese mapa.
 */
function marcarImeiCompartido(store, imei) {
  if (!store.ambiguousImeis) store.ambiguousImeis = {};
  store.ambiguousImeis[imei] = true;
  delete store.byImei[imei];
}

function syncByImei(store, imei) {
  if (store.ambiguousImeis?.[imei]) {
    delete store.byImei[imei];
    return;
  }
  const keys = rowKeysDelImei(store, imei);
  if (keys.length > 1) {
    marcarImeiCompartido(store, imei);
    return;
  }
  if (keys.length === 1) {
    const name = entryName(store.byRowKey[keys[0]]);
    if (name) store.byImei[imei] = name;
    else delete store.byImei[imei];
  }
}

/** Vista para clientes: rowKey → nombre. */
export function getDeviceNamesView() {
  const store = readStore();
  const namesByRowKey = {};
  for (const [rowKey, entry] of Object.entries(store.byRowKey)) {
    const name = entryName(entry);
    if (name) namesByRowKey[rowKey] = name;
  }
  return {
    namesByRowKey,
    byImei: { ...store.byImei },
    updatedAt: new Date().toISOString(),
  };
}

export function getDeviceNameByImei(imei) {
  if (!imei) return null;
  const store = readStore();
  if (store.ambiguousImeis?.[imei] || rowKeysDelImei(store, imei).length > 1) return null;

  const fromImei = normalizeName(store.byImei[imei]);
  if (fromImei) return fromImei;

  for (const entry of Object.values(store.byRowKey)) {
    if (entry?.imei === imei) {
      const name = entryName(entry);
      if (name) return name;
    }
  }
  return null;
}

export function getDeviceNameByRowKey(rowKey) {
  if (!rowKey) return null;
  const store = readStore();
  return entryName(store.byRowKey[rowKey]);
}

export function getDeviceNameHistory(rowKey, limit = 20) {
  if (!rowKey) return [];
  return readHistory()
    .filter((e) => e.rowKey === rowKey)
    .slice(0, limit);
}

/**
 * Asigna o quita nombre de equipo (persistido en servidor, visible para todos los usuarios).
 */
export function setDeviceName({ rowKey, imei, codigo, name, usuario = 'sistema' }) {
  if (!rowKey || !imei) throw new Error('rowKey e imei son obligatorios');

  const store = readStore();
  const normalized = normalizeName(name);
  const prevEntry = store.byRowKey[rowKey];
  const prevName = entryName(prevEntry) ?? '—';
  const yaCompartido = rowKeysDelImei(store, imei).length > 1;

  if (normalized == null) {
    delete store.byRowKey[rowKey];
  } else {
    store.byRowKey[rowKey] = {
      name: normalized,
      imei,
      codigo: codigo ?? prevEntry?.codigo ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: usuario,
    };
  }
  if (yaCompartido || rowKeysDelImei(store, imei).length > 1) {
    marcarImeiCompartido(store, imei);
  } else {
    syncByImei(store, imei);
  }

  writeStore(store);
  propagarNombreAGrupos(rowKey, imei, normalized);

  const nextName = normalized ?? 'SIN ASIGNAR';
  if (prevName !== nextName) {
    const entry = {
      id: uid('dnh'),
      rowKey,
      imei,
      codigo: codigo ?? prevEntry?.codigo ?? undefined,
      nombreAnterior: prevName,
      nombreNuevo: nextName,
      changedAt: new Date().toISOString(),
      usuario,
    };
    writeHistory([entry, ...readHistory()]);
    return { name: normalized, historyEntry: entry };
  }

  return { name: normalized, historyEntry: null };
}

/** Fusión masiva imei → nombre (perfiles de usuario, sync legacy). */
export function mergeDeviceNames(entries) {
  if (!entries || typeof entries !== 'object') return readStore().byImei;
  const store = readStore();
  let changed = false;

  const tocados = [];
  for (const [key, name] of Object.entries(entries)) {
    const trimmed = normalizeName(name);
    if (!key || !trimmed) continue;
    const keys = rowKeysDelImei(store, key);
    if (store.ambiguousImeis?.[key] || keys.length > 1) continue;

    if (keys.length === 1) {
      const rowKey = keys[0];
      const entry = store.byRowKey[rowKey];
      if (entryName(entry) !== trimmed) {
        store.byRowKey[rowKey] = {
          ...entry,
          name: trimmed,
          imei: entry?.imei || key,
          updatedAt: new Date().toISOString(),
        };
        changed = true;
      }
    }
    if (store.byImei[key] !== trimmed) {
      store.byImei[key] = trimmed;
      changed = true;
    }
    tocados.push(key);
  }

  if (changed) {
    writeStore(store);
    for (const key of tocados) {
      const keys = rowKeysDelImei(store, key);
      propagarNombreAGrupos(keys[0] || null, key, store.byImei[key]);
    }
  }
  return store.byImei;
}

/** El nombre del listado es el que queda en cada grupo de correo. */
function propagarNombreAGrupos(rowKey, imei, name) {
  const grupos = readJson('grupos.json', []);
  if (!Array.isArray(grupos)) return;
  let changed = false;
  for (const grupo of grupos) {
    for (const device of grupo.devices ?? []) {
      const mismo = rowKey
        ? device.rowKey === rowKey
        : Boolean(imei && device.imei === imei);
      if (!mismo) continue;
      if (name) {
        if (device.nombrePlataforma !== name) {
          device.nombrePlataforma = name;
          changed = true;
        }
      } else if (device.nombrePlataforma) {
        delete device.nombrePlataforma;
        changed = true;
      }
    }
  }
  if (changed) writeJson('grupos.json', grupos);
}
