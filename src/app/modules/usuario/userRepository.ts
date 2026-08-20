import type { User } from '../../types';
import { BOOTSTRAP_USERS } from './bootstrapUsers';
import {
  fetchServerUsers,
  loginOnServer,
  createUserOnServer,
  updateUserOnServer,
  deleteUserOnServer,
  migrateUsersOnServer,
  fetchUserById,
  fetchUserByUsername,
} from './usersServerApi';

const LEGACY_STORAGE_KEY = 'ztrack_users_registry_v1';
const MIGRATION_FLAG_KEY = 'ztrack_users_migrated_v1';

function readLegacyLocal(): User[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as User[];
  } catch {
    return [];
  }
}

function clearLegacyLocal(): void {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

/** Migra usuarios del registro local al servidor (una sola vez). */
export async function migrateLegacyUsersIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return;
  const legacy = readLegacyLocal();
  if (legacy.length === 0) {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return;
  }
  try {
    await migrateUsersOnServer(legacy);
    clearLegacyLocal();
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
  } catch {
    // reintentar en próxima carga
  }
}

/** Inicializa registro en servidor y migra datos locales si existen. */
export async function ensureUserRegistry(): Promise<User[]> {
  await migrateLegacyUsersIfNeeded();
  return [];
}

export async function getUsers(actingUser?: string): Promise<User[]> {
  try {
    return await fetchServerUsers(actingUser ?? 'sistema', false);
  } catch {
    return readLegacyLocal();
  }
}

export async function getUserById(id: string): Promise<User | undefined> {
  try {
    const user = await fetchUserById(id);
    return user ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  try {
    const user = await fetchUserByUsername(username);
    return user ?? undefined;
  } catch {
    const u = username.toLowerCase();
    return (await getUsers()).find((x) => x.username.toLowerCase() === u);
  }
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  await migrateLegacyUsersIfNeeded();
  try {
    return await loginOnServer(username, password);
  } catch {
    const user = (await getUsers()).find(
      (x) => x.username.toLowerCase() === username.toLowerCase()
    );
    if (user == null || user.password !== password) return null;
    const { password: _p, ...publicUser } = user;
    return publicUser as User;
  }
}

export async function addUser(user: User, actingUser: string): Promise<User> {
  return createUserOnServer(user, actingUser);
}

export async function updateUser(
  id: string,
  patch: Partial<User> & { accessFromDefault?: string },
  actingUser: string
): Promise<User> {
  return updateUserOnServer(id, patch, actingUser);
}

export async function deleteUser(id: string, actingUser: string): Promise<void> {
  await deleteUserOnServer(id, actingUser);
}

export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
