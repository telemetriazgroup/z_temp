import type { SessionUser, User, UserRole } from '../../types';
import { BOOTSTRAP_USERS } from './bootstrapUsers';

const STORAGE_KEY = 'ztrack_users_registry_v1';

const ROLES: UserRole[] = ['Administrador', 'Monitoreo', 'Solo Vista'];

export function normalizeUser(record: unknown): User | null {
  if (record == null || typeof record !== 'object') return null;
  const r = record as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.username !== 'string' || typeof r.password !== 'string') return null;
  const role = r.role as UserRole;
  return {
    id: r.id,
    username: r.username,
    password: r.password,
    nombre: typeof r.nombre === 'string' ? r.nombre : '',
    correo: typeof r.correo === 'string' ? r.correo : '',
    empresa: typeof r.empresa === 'string' ? r.empresa : '',
    role: ROLES.includes(role) ? role : 'Solo Vista',
    deviceAccess: Array.isArray(r.deviceAccess)
      ? r.deviceAccess.filter((x): x is string => typeof x === 'string')
      : [],
    superUser: r.superUser === true,
    deviceNames:
      r.deviceNames != null && typeof r.deviceNames === 'object' && !Array.isArray(r.deviceNames)
        ? (r.deviceNames as Record<string, string>)
        : undefined,
  };
}

function readRaw(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUser).filter((u): u is User => u != null);
  } catch {
    return [];
  }
}

function writeRaw(users: User[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

/** Completa nombre/correo/empresa vacíos desde la semilla correspondiente (migración suave). */
function mergeSeedProfileFields(users: User[]): { users: User[]; changed: boolean } {
  let changed = false;
  const next = users.map((u) => {
    const seed = BOOTSTRAP_USERS.find((s) => s.username.toLowerCase() === u.username.toLowerCase());
    if (seed == null) return u;
    const copy = { ...u };
    if (!(copy.nombre || '').trim()) {
      copy.nombre = seed.nombre;
      changed = true;
    }
    if (!(copy.correo || '').trim()) {
      copy.correo = seed.correo;
      changed = true;
    }
    if (!(copy.empresa || '').trim()) {
      copy.empresa = seed.empresa;
      changed = true;
    }
    return copy;
  });
  return { users: next, changed };
}

/** Asegura usuarios semilla sin borrar el resto; sincroniza perfiles base. */
export function ensureUserRegistry(): User[] {
  let users = readRaw();
  if (users.length === 0) {
    writeRaw(BOOTSTRAP_USERS.map((u) => ({ ...u })));
    return readRaw();
  }
  const byUser = new Set(users.map((u) => u.username.toLowerCase()));
  let changed = false;
  for (const seed of BOOTSTRAP_USERS) {
    if (!byUser.has(seed.username.toLowerCase())) {
      users.push({ ...seed });
      changed = true;
    }
  }
  const merged = mergeSeedProfileFields(users);
  if (merged.changed) {
    users = merged.users;
    changed = true;
  }
  if (changed) writeRaw(users);
  return readRaw();
}

export function getUsers(): User[] {
  return readRaw();
}

export function getUserById(id: string): User | undefined {
  return readRaw().find((u) => u.id === id);
}

export function getUserByUsername(username: string): User | undefined {
  const u = username.toLowerCase();
  return readRaw().find((x) => x.username.toLowerCase() === u);
}

export function authenticate(username: string, password: string): User | null {
  ensureUserRegistry();
  const user = getUserByUsername(username);
  if (user == null || user.password !== password) return null;
  return user;
}

export function saveUsers(users: User[]): void {
  writeRaw(users);
}

function assertUniqueUsername(users: User[], username: string, excludeId?: string): void {
  if (
    users.some(
      (u) => u.id !== excludeId && u.username.toLowerCase() === username.trim().toLowerCase()
    )
  ) {
    throw new Error('Ya existe un usuario con ese nombre de usuario');
  }
}

function assertUniqueCorreo(users: User[], correo: string, excludeId?: string): void {
  const c = correo.trim().toLowerCase();
  if (c === '') return;
  if (users.some((u) => u.id !== excludeId && u.correo.trim().toLowerCase() === c)) {
    throw new Error('Ya existe un usuario con ese correo');
  }
}

export function addUser(user: User): void {
  const users = readRaw();
  assertUniqueUsername(users, user.username);
  assertUniqueCorreo(users, user.correo);
  users.push(user);
  writeRaw(users);
}

export function updateUser(id: string, patch: Partial<User>): void {
  const users = readRaw();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Usuario no encontrado');
  const prev = users[idx];
  if (patch.username != null && patch.username !== prev.username) {
    assertUniqueUsername(users, patch.username, id);
  }
  if (patch.correo != null && patch.correo.trim() !== (prev.correo || '').trim()) {
    assertUniqueCorreo(users, patch.correo, id);
  }
  const next: User = { ...prev, ...patch };
  if (patch.password === undefined || patch.password === '') {
    next.password = prev.password;
  }
  users[idx] = next;
  writeRaw(users);
}

export function deleteUser(id: string): void {
  const users = readRaw();
  const target = users.find((u) => u.id === id);
  if (target == null) return;
  if (target.superUser === true && users.filter((u) => u.superUser === true).length <= 1) {
    throw new Error('No se puede eliminar el último superusuario');
  }
  writeRaw(users.filter((u) => u.id !== id));
}

export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function toSessionUser(user: User): SessionUser {
  const { password: _p, ...rest } = user;
  return rest;
}

/** Cambio de contraseña por el propio usuario (valida contraseña actual). */
export function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void {
  if (newPassword.length < 6) {
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  }
  const u = getUserById(userId);
  if (u == null || u.password !== currentPassword) {
    throw new Error('La contraseña actual no es correcta');
  }
  updateUser(userId, { password: newPassword });
}
