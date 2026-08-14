import type { User } from '../../types';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function headers(username?: string | null, superUser?: boolean): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (username?.trim()) h['X-ZTrack-User'] = username.trim();
  if (superUser) h['X-ZTrack-Super-User'] = 'true';
  return h;
}

async function parseRes<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return body;
}

export async function fetchServerUsers(
  actingUser?: string | null,
  _superUser?: boolean
): Promise<User[]> {
  const res = await fetch(`${BASE}/users`, {
    headers: headers(actingUser, false),
  });
  const body = await parseRes<{ data: User[] }>(res);
  return body.data;
}

export async function loginOnServer(
  username: string,
  password: string
): Promise<User | null> {
  const res = await fetch(`${BASE}/users/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) return null;
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function fetchUserById(id: string): Promise<User | null> {
  const res = await fetch(`${BASE}/users/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function fetchUserByUsername(username: string): Promise<User | null> {
  const encoded = encodeURIComponent(username.trim());
  const res = await fetch(`${BASE}/users/by-username/${encoded}`);
  if (res.status === 404) return null;
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function createUserOnServer(
  user: User,
  actingUser: string
): Promise<User> {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: headers(actingUser, false),
    body: JSON.stringify(user),
  });
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function updateUserOnServer(
  id: string,
  patch: Partial<User>,
  actingUser: string
): Promise<User> {
  const res = await fetch(`${BASE}/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(actingUser, false),
    body: JSON.stringify(patch),
  });
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function updateOwnProfileOnServer(
  id: string,
  patch: {
    displayName?: string;
    zonaHoraria?: string;
    avatarUrl?: string;
    cargo?: string;
    nombres?: string;
    apellidos?: string;
    dni?: string;
    correo?: string;
    telefono?: string;
    sexo?: string;
    currentPassword?: string;
    newPassword?: string;
  },
  actingUser: string
): Promise<User> {
  const res = await fetch(`${BASE}/users/${encodeURIComponent(id)}/profile`, {
    method: 'PUT',
    headers: headers(actingUser, false),
    body: JSON.stringify(patch),
  });
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function deleteUserOnServer(id: string, actingUser: string): Promise<void> {
  const res = await fetch(`${BASE}/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(actingUser, false),
  });
  await parseRes<{ ok: true }>(res);
}

export async function migrateUsersOnServer(users: User[]): Promise<{ added: number; total: number }> {
  const res = await fetch(`${BASE}/users/migrate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ users }),
  });
  const body = await parseRes<{ data: { added: number; total: number } }>(res);
  return body.data;
}
