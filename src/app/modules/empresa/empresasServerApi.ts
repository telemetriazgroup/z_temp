import type { Empresa, User } from '../../types';

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

export async function fetchEmpresas(): Promise<Empresa[]> {
  const res = await fetch(`${BASE}/empresas`);
  const body = await parseRes<{ data: Empresa[] }>(res);
  return body.data;
}

export async function fetchEmpresaById(
  id: string
): Promise<Empresa & { usuarios: User[] }> {
  const res = await fetch(`${BASE}/empresas/${encodeURIComponent(id)}`);
  const body = await parseRes<{ data: Empresa & { usuarios: User[] } }>(res);
  return body.data;
}

export async function createEmpresaOnServer(
  empresa: Partial<Empresa>,
  actingUser: string
): Promise<Empresa> {
  const res = await fetch(`${BASE}/empresas`, {
    method: 'POST',
    headers: headers(actingUser, true),
    body: JSON.stringify(empresa),
  });
  const body = await parseRes<{ data: Empresa }>(res);
  return body.data;
}

export async function updateEmpresaOnServer(
  id: string,
  patch: Partial<Empresa>,
  actingUser: string
): Promise<Empresa> {
  const res = await fetch(`${BASE}/empresas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(actingUser, true),
    body: JSON.stringify(patch),
  });
  const body = await parseRes<{ data: Empresa }>(res);
  return body.data;
}

export async function deleteEmpresaOnServer(
  id: string,
  actingUser: string
): Promise<void> {
  const res = await fetch(`${BASE}/empresas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(actingUser, true),
  });
  await parseRes(res);
}

export async function assignUserToEmpresa(
  empresaId: string,
  userId: string,
  actingUser: string
): Promise<User> {
  const res = await fetch(
    `${BASE}/empresas/${encodeURIComponent(empresaId)}/assign`,
    {
      method: 'POST',
      headers: headers(actingUser, true),
      body: JSON.stringify({ userId }),
    }
  );
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}

export async function unassignUserEmpresa(
  userId: string,
  actingUser: string
): Promise<User> {
  const res = await fetch(`${BASE}/empresas/unassign`, {
    method: 'POST',
    headers: headers(actingUser, true),
    body: JSON.stringify({ userId }),
  });
  const body = await parseRes<{ data: User }>(res);
  return body.data;
}
