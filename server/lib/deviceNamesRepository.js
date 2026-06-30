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
  return { byRowKey: {}, byImei };
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
  const prevName = entryName(prevEntry) ?? normalizeName(store.byImei[imei]) ?? '—';

  if (normalized == null) {
    delete store.byRowKey[rowKey];
    delete store.byImei[imei];
  } else {
    store.byRowKey[rowKey] = {
      name: normalized,
      imei,
      codigo: codigo ?? prevEntry?.codigo ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: usuario,
    };
    store.byImei[imei] = normalized;
  }

  writeStore(store);

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

  for (const [key, name] of Object.entries(entries)) {
    const trimmed = normalizeName(name);
    if (!key || !trimmed) continue;

    if (store.byImei[key] !== trimmed) {
      store.byImei[key] = trimmed;
      changed = true;
    }

    for (const [rowKey, entry] of Object.entries(store.byRowKey)) {
      if (entry?.imei === key && entryName(entry) !== trimmed) {
        store.byRowKey[rowKey] = {
          ...entry,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        };
        changed = true;
      }
    }
  }

  if (changed) writeStore(store);
  return store.byImei;
}
