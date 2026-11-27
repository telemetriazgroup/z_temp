import { readJson, writeJson, uid } from './store.js';

const NAMES_FILE = 'deviceNames.json';
const HISTORY_FILE = 'deviceNameHistory.json';
const MAX_HISTORY = 2000;

const FAMILIA_DE = {
  STARCOOL: 'STARCOOL',
  STARCOOL2: 'STARCOOL',
  TUNEL: 'TUNEL',
  TERMOKING: 'TERMOKING',
  THERMOKING: 'TERMOKING',
};

function normalizeName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.toUpperCase() === 'SIN ASIGNAR') return null;
  return trimmed;
}

/** StarCool y StarCool2 comparten nombre. Túnel y ThermoKing no. */
export function familiaDeCodigo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  return FAMILIA_DE[c] || null;
}

export function identificarNombre(rowKey, entry) {
  const raw = String(rowKey || '');
  if (raw.includes('|')) {
    const corte = raw.indexOf('|');
    const familia = familiaDeCodigo(raw.slice(0, corte));
    const imei = raw.slice(corte + 1);
    if (familia && imei) {
      return { familia, imei, clave: `${familia}|${imei}`, codigo: entry?.codigo || null };
    }
  }
  const imei = entry?.imei
    ? String(entry.imei)
    : raw.includes('-')
      ? raw.slice(raw.indexOf('-') + 1)
      : raw;
  const codigo = entry?.codigo
    || (imei && raw.endsWith(`-${imei}`) ? raw.slice(0, -(imei.length + 1)) : '');
  const familia = familiaDeCodigo(codigo);
  if (!familia || !imei) return null;
  return { familia, imei: String(imei), clave: `${familia}|${imei}`, codigo: String(codigo) };
}

function espejos(familia, imei) {
  if (familia === 'STARCOOL') return [`STARCOOL-${imei}`, `STARCOOL2-${imei}`];
  if (familia === 'TUNEL') return [`TUNEL-${imei}`];
  if (familia === 'TERMOKING') return [`TERMOKING-${imei}`, `THERMOKING-${imei}`];
  return [];
}

function readStoreCrudo() {
  const raw = readJson(NAMES_FILE, {});
  if (raw.byRowKey != null || raw.byImei != null) {
    return {
      byRowKey: raw.byRowKey ?? {},
      byImei: raw.byImei ?? {},
      ambiguousImeis: raw.ambiguousImeis ?? {},
      registroVersion: raw.registroVersion ?? 0,
    };
  }
  const byImei = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      const name = normalizeName(value);
      if (name) byImei[key] = name;
    }
  }
  return { byRowKey: {}, byImei, ambiguousImeis: {}, registroVersion: 0 };
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

function familiasPresentes(store, imei) {
  const set = new Set();
  for (const [rowKey, entry] of Object.entries(store.byRowKey || {})) {
    const id = identificarNombre(rowKey, entry);
    if (id && id.imei === String(imei)) set.add(id.familia);
  }
  return [...set];
}

function escribirFamilia(store, ident, name, usuario, updatedAt) {
  const ahora = updatedAt || new Date().toISOString();
  const base = {
    name,
    imei: ident.imei,
    familia: ident.familia,
    updatedAt: ahora,
    updatedBy: usuario || 'sistema',
  };
  if (name) {
    store.byRowKey[ident.clave] = { ...base, codigo: ident.familia };
    for (const clave of espejos(ident.familia, ident.imei)) {
      store.byRowKey[clave] = { ...base, codigo: clave.slice(0, clave.lastIndexOf('-')) };
    }
  } else {
    delete store.byRowKey[ident.clave];
    for (const clave of espejos(ident.familia, ident.imei)) delete store.byRowKey[clave];
  }
  const fams = familiasPresentes(store, ident.imei);
  if (fams.length === 1 && name) store.byImei[ident.imei] = name;
  else delete store.byImei[ident.imei];
  if (fams.length > 1) {
    if (!store.ambiguousImeis) store.ambiguousImeis = {};
    store.ambiguousImeis[ident.imei] = true;
  } else if (store.ambiguousImeis) {
    delete store.ambiguousImeis[ident.imei];
  }
}

function evento({ ident, codigo, anterior, nuevo, usuario, origen, aplicado, motivo }) {
  return {
    id: uid('dnh'),
    rowKey: ident?.clave || '',
    imei: ident?.imei || '',
    codigo: codigo || ident?.codigo || ident?.familia || undefined,
    familia: ident?.familia || undefined,
    nombreAnterior: anterior ?? '—',
    nombreNuevo: nuevo ?? 'SIN ASIGNAR',
    changedAt: new Date().toISOString(),
    usuario: usuario || 'sistema',
    origen,
    aplicado,
    motivo,
  };
}

/**
 * Junta StarCool y StarCool2 en una sola ficha.
 * No mezcla esa ficha con Túnel ni con ThermoKing.
 */
export function migrarStore(store) {
  const next = {
    byRowKey: { ...(store.byRowKey || {}) },
    byImei: { ...(store.byImei || {}) },
    ambiguousImeis: { ...(store.ambiguousImeis || {}) },
    registroVersion: store.registroVersion || 0,
  };
  const eventos = [];
  if (next.registroVersion === 2) return { store: next, eventos, changed: false };

  const grupos = new Map();
  for (const [rowKey, entry] of Object.entries(next.byRowKey)) {
    const id = identificarNombre(rowKey, entry);
    if (!id) continue;
    if (!grupos.has(id.clave)) grupos.set(id.clave, []);
    grupos.get(id.clave).push({ rowKey, entry, id });
  }

  for (const [, items] of grupos) {
    const conNombre = items
      .map((item) => ({ ...item, name: entryName(item.entry) }))
      .filter((item) => item.name);
    conNombre.sort((a, b) => String(b.entry?.updatedAt || '').localeCompare(String(a.entry?.updatedAt || '')));
    if (!conNombre.length) continue;
    const elegido = conNombre[0];
    for (const otro of conNombre.slice(1)) {
      if (otro.name === elegido.name) continue;
      eventos.push(evento({
        ident: elegido.id,
        codigo: otro.id.codigo,
        anterior: otro.name,
        nuevo: elegido.name,
        usuario: 'migracion',
        origen: 'migracion',
        aplicado: true,
        motivo: `Había otro nombre en ${otro.rowKey}. Quedó el más reciente de ${elegido.id.familia}, ${elegido.rowKey}.`,
      }));
    }
    escribirFamilia(next, elegido.id, elegido.name, elegido.entry?.updatedBy || 'migracion', elegido.entry?.updatedAt);
  }

  for (const [imei, name] of Object.entries({ ...next.byImei })) {
    const limpio = normalizeName(name);
    const fams = familiasPresentes(next, imei);
    if (!limpio || fams.length !== 1) {
      if (fams.length > 1) delete next.byImei[imei];
      continue;
    }
    const ident = { familia: fams[0], imei, clave: `${fams[0]}|${imei}`, codigo: fams[0] };
    const actual = entryName(next.byRowKey[ident.clave]);
    if (actual && actual !== limpio) {
      eventos.push(evento({
        ident,
        anterior: actual,
        nuevo: limpio,
        usuario: 'migracion',
        origen: 'migracion',
        aplicado: false,
        motivo: 'Había un nombre suelto por IMEI distinto al de esta familia. No reemplazó el nombre ya asignado.',
      }));
      delete next.byImei[imei];
    }
  }

  next.registroVersion = 2;
  return { store: next, eventos, changed: true };
}

function readStore() {
  const crudo = readStoreCrudo();
  const { store, eventos, changed } = migrarStore(crudo);
  if (changed) {
    writeStore(store);
    if (eventos.length) writeHistory([...eventos, ...readHistory()]);
  }
  return store;
}

function nombreDeClave(store, rowKey) {
  const directo = entryName(store.byRowKey[rowKey]);
  if (directo) return directo;
  const id = identificarNombre(rowKey, null);
  if (!id) return null;
  const familiar = entryName(store.byRowKey[id.clave]);
  if (familiar) return familiar;
  for (const clave of espejos(id.familia, id.imei)) {
    const nombre = entryName(store.byRowKey[clave]);
    if (nombre) return nombre;
  }
  return null;
}

export function getDeviceNamesView() {
  const store = readStore();
  const namesByRowKey = {};
  for (const [rowKey, entry] of Object.entries(store.byRowKey)) {
    const name = entryName(entry);
    if (name && !rowKey.includes('|')) namesByRowKey[rowKey] = name;
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
  const fams = familiasPresentes(store, imei);
  if (fams.length > 1) return null;
  if (fams.length === 1) return entryName(store.byRowKey[`${fams[0]}|${imei}`]) || normalizeName(store.byImei[imei]);
  return normalizeName(store.byImei[imei]);
}

export function getDeviceNameByRowKey(rowKey) {
  if (!rowKey) return null;
  return nombreDeClave(readStore(), rowKey);
}

export function tieneNombreEnOtraFamilia(codigo, imei) {
  if (!imei) return false;
  const propia = familiaDeCodigo(codigo);
  const store = readStore();
  for (const familia of familiasPresentes(store, imei)) {
    if (familia === propia) continue;
    if (entryName(store.byRowKey[`${familia}|${imei}`])) return true;
  }
  return false;
}

function historiaCoincide(entry, rowKey) {
  if (!entry) return false;
  if (entry.rowKey === rowKey) return true;
  const id = identificarNombre(rowKey, null);
  if (!id) return false;
  if (entry.rowKey === id.clave) return true;
  if (entry.imei === id.imei && entry.familia === id.familia) return true;
  if (entry.imei === id.imei && familiaDeCodigo(entry.codigo) === id.familia) return true;
  return false;
}

export function getDeviceNameHistory(rowKey, limit = 20) {
  if (!rowKey) return [];
  return readHistory().filter((e) => historiaCoincide(e, rowKey)).slice(0, limit);
}

function anexarHistoria(entradas) {
  const previas = readHistory();
  const nuevas = [];
  for (const entrada of entradas) {
    if (entrada.aplicado === false) {
      const repetido = previas.some((e) =>
        e.aplicado === false
        && e.imei === entrada.imei
        && e.familia === entrada.familia
        && e.nombreAnterior === entrada.nombreAnterior
        && e.nombreNuevo === entrada.nombreNuevo
        && e.origen === entrada.origen
      );
      if (repetido) continue;
    }
    nuevas.push(entrada);
  }
  if (nuevas.length) writeHistory([...nuevas, ...previas]);
  return nuevas;
}

export function setDeviceName({ rowKey, imei, codigo, name, usuario = 'sistema' }) {
  if (!rowKey || !imei) throw new Error('rowKey e imei son obligatorios');
  const store = readStore();
  const ident = identificarNombre(rowKey, { imei, codigo }) || identificarNombre(`${codigo || ''}-${imei}`, { imei, codigo });
  if (!ident) throw new Error('No se reconoce el origen del equipo');

  const normalized = normalizeName(name);
  const prevName = nombreDeClave(store, ident.clave) ?? '—';
  const nextName = normalized ?? 'SIN ASIGNAR';
  escribirFamilia(store, ident, normalized, usuario);
  writeStore(store);
  for (const clave of espejos(ident.familia, ident.imei)) {
    propagarNombreAGrupos(clave, null, normalized);
  }

  let historyEntry = null;
  if (prevName !== nextName) {
    historyEntry = evento({
      ident,
      codigo: codigo || ident.codigo,
      anterior: prevName,
      nuevo: nextName,
      usuario,
      origen: 'manual',
      aplicado: true,
      motivo: normalized
        ? `Se asignó el nombre de ${ident.familia === 'STARCOOL' ? 'StarCool y StarCool2' : ident.familia}.`
        : `Se quitó el nombre de ${ident.familia === 'STARCOOL' ? 'StarCool y StarCool2' : ident.familia}.`,
    });
    anexarHistoria([historyEntry]);
  }
  return { name: normalized, historyEntry };
}

/**
 * La sincronización de perfiles no pisa un nombre ya asignado.
 * Si lo intenta, queda anotado y el nombre anterior sigue.
 */
export function mergeDeviceNames(entries) {
  if (!entries || typeof entries !== 'object') return readStore().byImei;
  const store = readStore();
  const eventos = [];
  let changed = false;

  for (const [imei, name] of Object.entries(entries)) {
    const trimmed = normalizeName(name);
    if (!imei || !trimmed) continue;
    const fams = familiasPresentes(store, imei);
    if (fams.length > 1) {
      eventos.push(evento({
        ident: { familia: undefined, imei, clave: imei },
        anterior: '—',
        nuevo: trimmed,
        usuario: 'sync',
        origen: 'sync',
        aplicado: false,
        motivo: 'Este IMEI está en más de un origen. La sincronización no cambió ningún nombre.',
      }));
      continue;
    }
    if (fams.length === 0) {
      const suelto = normalizeName(store.byImei[imei]);
      if (suelto && suelto !== trimmed) {
        eventos.push(evento({
          ident: { imei, clave: imei },
          anterior: suelto,
          nuevo: trimmed,
          usuario: 'sync',
          origen: 'sync',
          aplicado: false,
          motivo: 'Llegó otro nombre sin origen. Se conservó el que ya estaba guardado por IMEI.',
        }));
      } else if (!suelto) {
        store.byImei[imei] = trimmed;
        changed = true;
        eventos.push(evento({
          ident: { imei, clave: imei },
          anterior: '—',
          nuevo: trimmed,
          usuario: 'sync',
          origen: 'sync',
          aplicado: true,
          motivo: 'Quedó guardado por IMEI, sin origen. No se copió a Túnel, ThermoKing ni StarCool.',
        }));
      }
      continue;
    }
    const ident = { familia: fams[0], imei, clave: `${fams[0]}|${imei}`, codigo: fams[0] };
    const actual = nombreDeClave(store, ident.clave);
    if (actual === trimmed) continue;
    if (actual) {
      eventos.push(evento({
        ident,
        anterior: actual,
        nuevo: trimmed,
        usuario: 'sync',
        origen: 'sync',
        aplicado: false,
        motivo: 'La sincronización quiso reemplazar el nombre. Se conservó el asignado.',
      }));
      continue;
    }
    escribirFamilia(store, ident, trimmed, 'sync');
    changed = true;
    for (const clave of espejos(ident.familia, imei)) propagarNombreAGrupos(clave, null, trimmed);
    eventos.push(evento({
      ident,
      anterior: '—',
      nuevo: trimmed,
      usuario: 'sync',
      origen: 'sync',
      aplicado: true,
      motivo: 'No había nombre en esta familia y la sincronización lo completó.',
    }));
  }

  if (changed) writeStore(store);
  anexarHistoria(eventos);
  return store.byImei;
}

export function esReescritura(entry) {
  if (!entry) return false;
  if (entry.aplicado === false) return true;
  if (entry.origen === 'migracion') return true;
  const prev = entry.nombreAnterior;
  if (!prev || prev === '—' || prev === 'SIN ASIGNAR') return false;
  return prev !== entry.nombreNuevo;
}

export function listarRegistroNombres() {
  const store = readStore();
  const equipos = [];
  for (const [clave, entry] of Object.entries(store.byRowKey)) {
    if (!clave.includes('|')) continue;
    const name = entryName(entry);
    if (!name) continue;
    equipos.push({
      clave,
      imei: entry.imei,
      familia: entry.familia,
      nombre: name,
      updatedAt: entry.updatedAt || null,
      updatedBy: entry.updatedBy || null,
      comparteStarcool: entry.familia === 'STARCOOL',
    });
  }
  equipos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  const sueltos = [];
  for (const [imei, name] of Object.entries(store.byImei)) {
    if (familiasPresentes(store, imei).length > 0) continue;
    const limpio = normalizeName(name);
    if (!limpio) continue;
    sueltos.push({ imei, nombre: limpio });
  }
  sueltos.sort((a, b) => a.imei.localeCompare(b.imei));

  const reescrituras = readHistory().filter(esReescritura).slice(0, 300);
  return { equipos, sueltos, reescrituras };
}

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
