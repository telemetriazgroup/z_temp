import { readJson, writeJson, uid } from './store.js';
import { BOOTSTRAP_USERS } from './bootstrapUsers.js';

const USERS_FILE = 'users.json';
const VALID_ROLES = new Set(['Administrador', 'Monitoreo', 'Solo Vista']);

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

function validateUserShape(user, { requirePassword = false } = {}) {
  if (!user || typeof user !== 'object') throw new Error('Usuario inválido');
  const username = user.username?.toString().trim();
  if (!username) throw new Error('El usuario es obligatorio');
  if (requirePassword && !user.password?.toString().trim()) {
    throw new Error('La contraseña es obligatoria');
  }
  const role = user.role?.toString().trim();
  if (!VALID_ROLES.has(role)) throw new Error('Rol inválido');
  const deviceAccess = Array.isArray(user.deviceAccess) ? user.deviceAccess.map(String) : [];
  if (user.superUser !== true && !deviceAccess.includes('all') && deviceAccess.length === 0) {
    throw new Error('Indique al menos un IMEI o marque superusuario');
  }
  return {
    id: user.id?.toString().trim() || uid('user'),
    username,
    password: user.password?.toString() ?? '',
    role,
    deviceAccess: user.superUser === true ? ['all'] : deviceAccess,
    superUser: user.superUser === true,
    deviceNames:
      user.deviceNames && typeof user.deviceNames === 'object' && !Array.isArray(user.deviceNames)
        ? { ...user.deviceNames }
        : undefined,
    allowedCodigos: Array.isArray(user.allowedCodigos)
      ? user.allowedCodigos.map(String)
      : undefined,
  };
}

/** Respuesta segura para clientes (sin contraseña). */
export function publicUserView(user) {
  if (user == null) return null;
  const { password: _p, ...rest } = user;
  return cloneUser(rest);
}

export function getUsers() {
  ensureUserRegistry();
  return readUsersRaw().map(cloneUser);
}

export function getUsersPublic() {
  return getUsers().map(publicUserView);
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
  return users.filter((u) => u.superUser === true).length;
}

/** Inicializa usuarios semilla y fusiona cuentas nuevas del bootstrap. */
export function ensureUserRegistry() {
  let users = readUsersRaw();
  if (users == null || users.length === 0) {
    users = BOOTSTRAP_USERS.map(cloneUser);
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
  if (changed) writeUsers(users);
  return users;
}

export function authenticate(username, password) {
  ensureUserRegistry();
  const user = getUserByUsername(username);
  if (user == null || user.password !== password) return null;
  return publicUserView(user);
}

export function addUser(input) {
  ensureUserRegistry();
  const users = getUsers();
  const next = validateUserShape(input, { requirePassword: true });
  if (users.some((u) => normalizeUsername(u.username) === normalizeUsername(next.username))) {
    throw new Error('Ya existe un usuario con ese nombre');
  }
  users.push(next);
  writeUsers(users);
  return publicUserView(next);
}

export function updateUser(id, patch) {
  ensureUserRegistry();
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Usuario no encontrado');

  const prev = users[idx];
  const merged = { ...prev, ...patch, id: prev.id };
  if (patch.username != null && normalizeUsername(patch.username) !== normalizeUsername(prev.username)) {
    throw new Error('No se puede cambiar el nombre de usuario');
  }
  if (patch.password === undefined || patch.password === '') {
    merged.password = prev.password;
  }
  const next = validateUserShape(merged, { requirePassword: Boolean(merged.password) });
  users[idx] = next;
  writeUsers(users);
  return publicUserView(next);
}

export function deleteUser(id) {
  ensureUserRegistry();
  const users = getUsers();
  const target = users.find((u) => u.id === id);
  if (target == null) return;
  if (target.superUser === true && countSuperUsers(users) <= 1) {
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
