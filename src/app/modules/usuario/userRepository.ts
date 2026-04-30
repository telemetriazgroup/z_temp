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
