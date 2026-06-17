import type { User } from '../../types';
import { BOOTSTRAP_USERS } from './bootstrapUsers';

const STORAGE_KEY = 'ztrack_users_registry_v1';

function readRaw(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as User[];
  } catch {
    return [];
  }
}

function writeRaw(users: User[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sameDeviceNames(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const k of keys) {
    if ((left[k] ?? '') !== (right[k] ?? '')) return false;
  }
  return true;
}

/** Alinea alcance IFF de cuentas semilla ya guardadas (p. ej. nuevos IMEI en código). */
function syncBootstrapProfiles(users: User[]): { users: User[]; changed: boolean } {
  const seedById = new Map(BOOTSTRAP_USERS.map((s) => [s.id, s]));
  let changed = false;
  const next = users.map((u) => {
    const seed = seedById.get(u.id);
    if (seed == null) return u;
    let patched = u;
    if (!sameStringArray(u.deviceAccess, seed.deviceAccess)) {
      patched = { ...patched, deviceAccess: [...seed.deviceAccess] };
      changed = true;
    }
    if (!sameDeviceNames(u.deviceNames, seed.deviceNames)) {
      patched = {
        ...patched,
        deviceNames: seed.deviceNames ? { ...seed.deviceNames } : undefined,
      };
      changed = true;
    }
    if (u.role !== seed.role) {
      patched = { ...patched, role: seed.role };
      changed = true;
    }
    return patched;
  });
  return { users: next, changed };
}

/** Asegura usuarios semilla (superadmin, iifperu) sin borrar el resto. */
export function ensureUserRegistry(): User[] {
  let users = readRaw();
  if (users.length === 0) {
    writeRaw([...BOOTSTRAP_USERS]);
    return [...BOOTSTRAP_USERS];
  }
  const byUser = new Set(users.map((u) => u.username.toLowerCase()));
  let changed = false;
  for (const seed of BOOTSTRAP_USERS) {
    if (!byUser.has(seed.username.toLowerCase())) {
      users.push({ ...seed });
      changed = true;
    }
  }
  const synced = syncBootstrapProfiles(users);
  users = synced.users;
  if (synced.changed) changed = true;
  if (changed) writeRaw(users);
  return users;
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

export function addUser(user: User): void {
  const users = readRaw();
  if (users.some((u) => u.username.toLowerCase() === user.username.toLowerCase())) {
    throw new Error('Ya existe un usuario con ese nombre');
  }
  users.push(user);
  writeRaw(users);
}

export function updateUser(id: string, patch: Partial<User>): void {
  const users = readRaw();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Usuario no encontrado');
  const prev = users[idx];
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
