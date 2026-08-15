import { readJson, writeJson, uid } from './store.js';
import { getEmpresaById } from './empresasRepository.js';

const GRUPOS_FILE = 'grupos_equipos.json';

function readRaw() {
  const raw = readJson(GRUPOS_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeAll(list) {
  writeJson(GRUPOS_FILE, list);
}

function optStr(value) {
  const s = value?.toString().trim();
  return s ? s : undefined;
}

function normalizeImeis(list) {
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    ),
  ];
}

function validateGrupo(input, { requireId = false } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Grupo inválido');
  const nombre = optStr(input.nombre);
  if (!nombre) throw new Error('El nombre del grupo es obligatorio');

  let empresaId = input.empresaId;
  if (empresaId === '' || empresaId === null || empresaId === undefined) {
    empresaId = null;
  } else {
    empresaId = String(empresaId).trim();
    if (empresaId && !getEmpresaById(empresaId)) {
      throw new Error('La empresa de referencia no existe');
    }
  }

  return {
    id: requireId
      ? String(input.id).trim()
      : optStr(input.id) || uid('geq'),
    nombre,
    empresaId,
    imeis: normalizeImeis(input.imeis ?? input.containerIds ?? []),
    createdBy: optStr(input.createdBy),
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listGruposEquipos() {
  return readRaw().map((g) => ({ ...g, imeis: normalizeImeis(g.imeis) }));
}

export function getGrupoEquipoById(id) {
  const key = String(id ?? '').trim();
  if (!key) return null;
  return listGruposEquipos().find((g) => g.id === key) ?? null;
}

export function addGrupoEquipo(input, actorUsername) {
  const list = readRaw();
  const next = validateGrupo({
    ...input,
    createdBy: actorUsername ?? input.createdBy,
  });
  if (list.some((g) => g.id === next.id)) {
    throw new Error('Ya existe un grupo con ese id');
  }
  if (
    list.some(
      (g) =>
        String(g.nombre).trim().toLowerCase() === next.nombre.toLowerCase()
    )
  ) {
    throw new Error('Ya existe un grupo con ese nombre');
  }
  list.push(next);
  writeAll(list);
  return { ...next };
}

export function updateGrupoEquipo(id, patch) {
  const list = readRaw();
  const idx = list.findIndex((g) => g.id === id);
  if (idx === -1) throw new Error('Grupo no encontrado');
  const prev = list[idx];
  const next = validateGrupo(
    {
      ...prev,
      ...patch,
      id: prev.id,
      createdBy: prev.createdBy,
      createdAt: prev.createdAt,
    },
    { requireId: true }
  );
  if (
    list.some(
      (g) =>
        g.id !== id &&
        String(g.nombre).trim().toLowerCase() === next.nombre.toLowerCase()
    )
  ) {
    throw new Error('Ya existe un grupo con ese nombre');
  }
  list[idx] = next;
  writeAll(list);
  return { ...next };
}

export function deleteGrupoEquipo(id) {
  const list = readRaw();
  if (!list.some((g) => g.id === id)) throw new Error('Grupo no encontrado');
  writeAll(list.filter((g) => g.id !== id));
  return true;
}

/** IMEIs unidos de una lista de groupIds. */
export function imeisFromGroupIds(groupIds) {
  const ids = Array.isArray(groupIds) ? groupIds.map(String) : [];
  if (ids.length === 0) return [];
  const set = new Set();
  for (const g of listGruposEquipos()) {
    if (!ids.includes(g.id)) continue;
    for (const imei of g.imeis ?? []) set.add(String(imei));
  }
  return [...set];
}

/**
 * IMEIs efectivos de un usuario (deviceAccess + grupos).
 * Devuelve null si tiene acceso total ('all' / solo superadmin).
 * Admin ya no implica flota completa: usa su deviceAccess/groupIds.
 */
export function resolveUserEffectiveImeis(user) {
  if (!user) return [];
  if (user.superUser === true || user.category === 'superadmin') {
    return null;
  }
  const access = Array.isArray(user.deviceAccess)
    ? user.deviceAccess.map(String)
    : [];
  if (access.includes('all')) return null;
  const fromGroups = imeisFromGroupIds(user.groupIds);
  return [...new Set([...access.filter((x) => x && x !== 'all'), ...fromGroups])];
}

/** Quita un grupo de todos los usuarios que lo tengan asignado. */
export function detachGrupoFromUsers(grupoId, updateUserFn, getUsersFn) {
  const users = getUsersFn();
  for (const u of users) {
    const ids = Array.isArray(u.groupIds) ? u.groupIds : [];
    if (!ids.includes(grupoId)) continue;
    updateUserFn(u.id, {
      groupIds: ids.filter((x) => x !== grupoId),
    });
  }
}
