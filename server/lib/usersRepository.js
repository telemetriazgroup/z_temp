import { readJson, writeJson, uid } from './store.js';
import { BOOTSTRAP_USERS } from './bootstrapUsers.js';
import {
  resolveUserEffectiveImeis,
  getGrupoEquipoById,
} from './gruposEquiposRepository.js';

const USERS_FILE = 'users.json';
const VALID_ROLES = new Set(['Administrador', 'Monitoreo', 'Solo Vista']);
const VALID_CATEGORIES = new Set(['superadmin', 'admin', 'user']);
export const DEFAULT_ADMIN_MAX_USERS = 3;

function readUsersRaw() {
  const raw = readJson(USERS_FILE, null);
  if (raw == null) return null;
  return Array.isArray(raw) ? raw : null;
}

function writeUsers(users) {
  writeJson(USERS_FILE, users);
}

function cloneUser(user) {
  return JSON.parse(JSON.stringify(user));
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function normalizeZonaHoraria(value) {
  const z = String(value ?? 'GMT-5')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (z === 'GMT-4' || z === 'UTC-4' || z === '-04:00') return 'GMT-4';
  return 'GMT-5';
}

function normalizeTemperaturaUnidad(value) {
  const s = String(value ?? 'C').trim().toUpperCase();
  return s === 'F' || s === 'FAHRENHEIT' ? 'F' : 'C';
}

function optStr(value) {
  const s = value?.toString().trim();
  return s ? s : undefined;
}

const MAX_AVATAR_CHARS = 350_000;

function normalizeAvatarUrl(value) {
  const s = optStr(value);
  if (!s) return undefined;
  if (s.startsWith('data:image/')) {
    if (s.length > MAX_AVATAR_CHARS) {
      throw new Error('La imagen de perfil es demasiado grande');
    }
    return s;
  }
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) {
    if (s.length > 2000) throw new Error('URL de avatar inválida');
    return s;
  }
  throw new Error('Formato de imagen de perfil no válido');
}

function normalizeSexo(value) {
  const s = String(value ?? '')
    .trim()
    .toUpperCase();
  if (s === 'M' || s === 'F' || s === 'O') return s;
  return undefined;
}

function buildDisplayName(user) {
  const explicit = optStr(user.displayName);
  if (explicit) return explicit;
  const full = [optStr(user.nombres), optStr(user.apellidos)].filter(Boolean).join(' ');
  return full || undefined;
}

/** Normaliza categoría a partir de category / superUser legacy. */
export function resolveUserCategory(user) {
  if (user == null) return 'user';
  if (user.superUser === true) return 'superadmin';
  const c = String(user.category ?? '').trim().toLowerCase();
  if (VALID_CATEGORIES.has(c)) return c;
  return 'user';
}

export function isSuperAdminUser(user) {
  return resolveUserCategory(user) === 'superadmin';
}

export function isAdminUser(user) {
  return resolveUserCategory(user) === 'admin';
}

export function canManageUsers(user) {
  const c = resolveUserCategory(user);
  return c === 'superadmin' || c === 'admin';
}

export function canAccessAudit(user) {
  return isSuperAdminUser(user);
}

export function adminMaxManagedUsers(user) {
  const n = Number(user?.maxManagedUsers);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_ADMIN_MAX_USERS;
}

export function countUsersCreatedBy(creatorUsername, users = getUsers()) {
  const key = normalizeUsername(creatorUsername ?? '');
  if (!key) return 0;
  return users.filter(
    (u) => u.createdBy && normalizeUsername(u.createdBy) === key
  ).length;
}

/**
 * Un admin solo puede asignar IMEIs/grupos dentro de su propia flota
 * (la que le dio el superadmin).
 */
function assertActorMayAssignFleet(actor, deviceAccess, groupIds) {
  if (!actor || isSuperAdminUser(actor)) return;
  if (!isAdminUser(actor)) {
    throw new Error('No autorizado a asignar equipos');
  }
  const allowed = resolveUserEffectiveImeis(actor);
  if (allowed == null) return;
  const allowedSet = new Set(allowed.map(String));
  const imeis = Array.isArray(deviceAccess)
    ? deviceAccess.map(String).filter((x) => x && x !== 'all')
    : [];
  for (const imei of imeis) {
    if (!allowedSet.has(imei)) {
      throw new Error(
        `No puede asignar el equipo ${imei}: no está en su flota autorizada`
      );
    }
  }
  const gids = Array.isArray(groupIds) ? groupIds.map(String) : [];
  const actorGroupIds = new Set(
    Array.isArray(actor.groupIds) ? actor.groupIds.map(String) : []
  );
  for (const gid of gids) {
    if (actorGroupIds.has(gid)) continue;
    const g = getGrupoEquipoById(gid);
    if (!g) throw new Error(`Grupo no encontrado: ${gid}`);
    for (const imei of g.imeis ?? []) {
      if (!allowedSet.has(String(imei))) {
        throw new Error(
          `No puede asignar el grupo «${g.nombre}»: contiene equipos fuera de su flota`
        );
      }
    }
  }
}

function validateUserShape(user, { requirePassword = false } = {}) {
  if (!user || typeof user !== 'object') throw new Error('Usuario inválido');
  const username = user.username?.toString().trim();
  if (!username) throw new Error('El usuario es obligatorio');
  if (requirePassword && !user.password?.toString().trim()) {
    throw new Error('La contraseña es obligatoria');
  }
  const role = user.role?.toString().trim();
  if (!VALID_ROLES.has(role)) throw new Error('Rol inválido');

  let category = String(user.category ?? '').trim().toLowerCase();
  if (user.superUser === true) category = 'superadmin';
  if (!VALID_CATEGORIES.has(category)) category = 'user';
  const superUser = category === 'superadmin';

  let deviceAccess = Array.isArray(user.deviceAccess)
    ? user.deviceAccess.map(String)
    : [];
  // Solo superadmin tiene flota completa por defecto.
  if (superUser) {
    deviceAccess = ['all'];
  }

  const groupIds = Array.isArray(user.groupIds)
    ? [...new Set(user.groupIds.map(String).filter(Boolean))]
    : [];

  // Sin equipos al crear está permitido; se asignan luego en Administración.

  let maxManagedUsers;
  if (category === 'admin') {
    const n = Number(user.maxManagedUsers);
    maxManagedUsers =
      Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_ADMIN_MAX_USERS;
  }

  const avatarUrl = normalizeAvatarUrl(user.avatarUrl);
  const nombres = optStr(user.nombres);
  const apellidos = optStr(user.apellidos);
  return {
    id: user.id?.toString().trim() || uid('user'),
    username,
    password: user.password?.toString() ?? '',
    role,
    category,
    deviceAccess,
    superUser,
    maxManagedUsers,
    createdBy: optStr(user.createdBy),
    groupIds: groupIds.length ? groupIds : undefined,
    deviceNames:
      user.deviceNames && typeof user.deviceNames === 'object' && !Array.isArray(user.deviceNames)
        ? { ...user.deviceNames }
        : undefined,
    allowedCodigos: Array.isArray(user.allowedCodigos)
      ? user.allowedCodigos.map(String)
      : undefined,
    /** Desactivado por defecto; solo true si se asigna explícitamente. */
    puedeControlTemperatura: user.puedeControlTemperatura === true,
    displayName: buildDisplayName({ ...user, nombres, apellidos }),
    zonaHoraria: normalizeZonaHoraria(user.zonaHoraria ?? 'GMT-5'),
    temperaturaUnidad: normalizeTemperaturaUnidad(user.temperaturaUnidad),
    avatarUrl,
    cargo: optStr(user.cargo),
    nombres,
    apellidos,
    dni: optStr(user.dni),
    correo: optStr(user.correo),
    telefono: optStr(user.telefono),
    sexo: normalizeSexo(user.sexo),
    empresaId: optStr(user.empresaId),
  };
}

/** Respuesta segura para clientes (sin contraseña). */
export function publicUserView(user) {
  if (user == null) return null;
  const { password: _p, ...rest } = user;
  const view = cloneUser(rest);
  view.category = resolveUserCategory(view);
  view.superUser = view.category === 'superadmin';
  return view;
}

export function getUsers() {
  ensureUserRegistry();
  return readUsersRaw().map(cloneUser);
}

export function getUsersPublic() {
  return getUsers().map(publicUserView);
}

/** Listado visible según actor (superadmin: todos; admin: propios + sí mismo). */
export function listUsersForActor(actor) {
  const all = getUsersPublic();
  if (isSuperAdminUser(actor)) return all;
  if (!isAdminUser(actor)) return [];
  const key = normalizeUsername(actor.username);
  return all.filter(
    (u) =>
      u.id === actor.id ||
      (u.createdBy && normalizeUsername(u.createdBy) === key)
  );
}

export function getUserById(id) {
  return getUsers().find((u) => u.id === id);
}

export function getUserByIdPublic(id) {
  const user = getUserById(id);
  return user ? publicUserView(user) : null;
}

export function getUserByUsername(username) {
  const key = normalizeUsername(username);
  return getUsers().find((u) => normalizeUsername(u.username) === key);
}

export function countSuperUsers(users = getUsers()) {
  return users.filter((u) => isSuperAdminUser(u)).length;
}

function migrateCategoryFields(users) {
  let changed = false;
  for (const u of users) {
    if (!Array.isArray(u.deviceAccess)) {
      u.deviceAccess = u.superUser === true ? ['all'] : [];
      changed = true;
    }
    const cat = resolveUserCategory(u);
    if (u.category !== cat) {
      u.category = cat;
      changed = true;
    }
    if (cat === 'superadmin' && u.superUser !== true) {
      u.superUser = true;
      u.deviceAccess = ['all'];
      changed = true;
    }
    if (cat === 'admin') {
      // Admin ya no recibe flota completa automáticamente; el superadmin asigna equipos.
      if (!Array.isArray(u.deviceAccess)) {
        u.deviceAccess = [];
        changed = true;
      }
      if (u.maxManagedUsers == null) {
        u.maxManagedUsers = DEFAULT_ADMIN_MAX_USERS;
        changed = true;
      }
    }
  }
  return changed;
}

/** Inicializa usuarios semilla y fusiona cuentas nuevas del bootstrap. */
export function ensureUserRegistry() {
  let users = readUsersRaw();
  if (users == null || users.length === 0) {
    users = BOOTSTRAP_USERS.map(cloneUser);
    migrateCategoryFields(users);
    writeUsers(users);
    return users;
  }

  const byUsername = new Set(users.map((u) => normalizeUsername(u.username)));
  let changed = false;
  for (const seed of BOOTSTRAP_USERS) {
    if (!byUsername.has(normalizeUsername(seed.username))) {
      users.push(cloneUser(seed));
      changed = true;
    }
  }
  if (migrateCategoryFields(users)) changed = true;
  if (changed) writeUsers(users);
  return users;
}

export function authenticate(username, password) {
  ensureUserRegistry();
  const user = getUserByUsername(username);
  if (user == null || user.password !== password) return null;
  return publicUserView(user);
}

/**
 * @param {object} input
 * @param {{ actor?: object }} [opts]
 */
export function addUser(input, opts = {}) {
  ensureUserRegistry();
  const users = getUsers();
  const actor = opts.actor ?? null;
  const nextInput = { ...input };

  if (isAdminUser(actor) && !isSuperAdminUser(actor)) {
    const used = countUsersCreatedBy(actor.username, users);
    const max = adminMaxManagedUsers(actor);
    if (used >= max) {
      throw new Error(
        `Límite de usuarios alcanzado (${used}/${max}). Solicite al superadmin ampliar su cuota.`
      );
    }
    nextInput.category = 'user';
    nextInput.superUser = false;
    nextInput.createdBy = actor.username;
    delete nextInput.maxManagedUsers;
    // Flota solo vía Administración (update), no al crear con IMEI libres.
    nextInput.deviceAccess = [];
    nextInput.groupIds = [];
  } else if (isSuperAdminUser(actor)) {
    if (nextInput.createdBy == null) {
      nextInput.createdBy = actor.username;
    }
  }

  const next = validateUserShape(nextInput, { requirePassword: true });
  if (users.some((u) => normalizeUsername(u.username) === normalizeUsername(next.username))) {
    throw new Error('Ya existe un usuario con ese nombre');
  }
  users.push(next);
  writeUsers(users);
  return publicUserView(next);
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {{ actor?: object }} [opts]
 */
export function updateUser(id, patch, opts = {}) {
  ensureUserRegistry();
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Usuario no encontrado');
  const actor = opts.actor ?? null;
  const prev = users[idx];

  if (isAdminUser(actor) && !isSuperAdminUser(actor)) {
    const key = normalizeUsername(actor.username);
    const owns =
      prev.id === actor.id ||
      (prev.createdBy && normalizeUsername(prev.createdBy) === key);
    if (!owns) throw new Error('No puede editar este usuario');
    if (prev.id === actor.id) {
      // Admin solo edita su perfil personal vía profile; aquí limitar campos sensibles
      throw new Error('Use Ver perfil para editar su propia cuenta');
    }
    if (patch.category != null || patch.superUser === true) {
      throw new Error('Un admin no puede elevar categorías');
    }
    if (patch.maxManagedUsers != null) {
      throw new Error('Solo el superadmin puede cambiar la cuota de usuarios');
    }
    if (Array.isArray(patch.deviceAccess) && patch.deviceAccess.includes('all')) {
      throw new Error('Un admin no puede asignar acceso a todos los dispositivos');
    }
    assertActorMayAssignFleet(
      actor,
      patch.deviceAccess !== undefined ? patch.deviceAccess : prev.deviceAccess,
      patch.groupIds !== undefined ? patch.groupIds : prev.groupIds
    );
    patch = {
      ...patch,
      category: 'user',
      superUser: false,
      createdBy: prev.createdBy ?? actor.username,
    };
  }

  const merged = { ...prev, ...patch, id: prev.id };
  if (patch.username != null && normalizeUsername(patch.username) !== normalizeUsername(prev.username)) {
    throw new Error('No se puede cambiar el nombre de usuario');
  }
  if (patch.password === undefined || patch.password === '') {
    merged.password = prev.password;
  }
  // Solo superadmin puede cambiar maxManagedUsers de un admin
  if (
    patch.maxManagedUsers != null &&
    actor &&
    !isSuperAdminUser(actor)
  ) {
    merged.maxManagedUsers = prev.maxManagedUsers;
  }
  const next = validateUserShape(merged, { requirePassword: Boolean(merged.password) });
  users[idx] = next;
  writeUsers(users);
  return publicUserView(next);
}

/**
 * Actualización de perfil por el propio usuario (nombre, GMT, contraseña).
 * No permite cambiar rol, acceso ni superusuario.
 */
export function updateOwnProfile(id, patch, actingUsername) {
  ensureUserRegistry();
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Usuario no encontrado');
  const prev = users[idx];
  if (normalizeUsername(prev.username) !== normalizeUsername(actingUsername ?? '')) {
    throw new Error('Solo puede editar su propio perfil');
  }

  const nextPatch = { ...prev };

  const personalKeys = [
    'displayName',
    'cargo',
    'nombres',
    'apellidos',
    'dni',
    'correo',
    'telefono',
    'sexo',
    'avatarUrl',
  ];
  for (const key of personalKeys) {
    if (patch[key] !== undefined) {
      nextPatch[key] = patch[key];
    }
  }
  if (patch.zonaHoraria !== undefined) {
    nextPatch.zonaHoraria = normalizeZonaHoraria(patch.zonaHoraria);
  }
  if (patch.temperaturaUnidad !== undefined) {
    nextPatch.temperaturaUnidad = normalizeTemperaturaUnidad(patch.temperaturaUnidad);
  }

  const newPassword = patch.newPassword?.toString() ?? '';
  if (newPassword) {
    const current = patch.currentPassword?.toString() ?? '';
    if (!current || current !== prev.password) {
      throw new Error('Contraseña actual incorrecta');
    }
    if (newPassword.length < 4) {
      throw new Error('La nueva contraseña debe tener al menos 4 caracteres');
    }
    nextPatch.password = newPassword;
  }

  const next = validateUserShape(nextPatch, { requirePassword: true });
  users[idx] = next;
  writeUsers(users);
  return publicUserView(next);
}

export function deleteUser(id, opts = {}) {
  ensureUserRegistry();
  const users = getUsers();
  const target = users.find((u) => u.id === id);
  if (target == null) return;
  const actor = opts.actor ?? null;

  if (isAdminUser(actor) && !isSuperAdminUser(actor)) {
    const key = normalizeUsername(actor.username);
    if (!target.createdBy || normalizeUsername(target.createdBy) !== key) {
      throw new Error('Solo puede eliminar usuarios que usted creó');
    }
    if (isSuperAdminUser(target) || isAdminUser(target)) {
      throw new Error('No puede eliminar cuentas admin/superadmin');
    }
  }

  if (isSuperAdminUser(target) && countSuperUsers(users) <= 1) {
    throw new Error('No se puede eliminar el último superusuario');
  }
  writeUsers(users.filter((u) => u.id !== id));
}

/**
 * Importa usuarios desde localStorage del cliente (solo añade los que no existen por username).
 */
export function migrateUsersFromClient(incoming) {
  ensureUserRegistry();
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { added: 0, total: getUsers().length };
  }

  const users = getUsers();
  const byUsername = new Set(users.map((u) => normalizeUsername(u.username)));
  let added = 0;

  for (const raw of incoming) {
    try {
      const candidate = validateUserShape(raw, { requirePassword: true });
      const key = normalizeUsername(candidate.username);
      if (byUsername.has(key)) continue;
      users.push(candidate);
      byUsername.add(key);
      added += 1;
    } catch {
      // omitir entradas inválidas
    }
  }

  if (added > 0) writeUsers(users);
  return { added, total: users.length };
}
