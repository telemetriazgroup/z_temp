import type { GrupoEquipo } from '../../types';

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

export async function fetchGruposEquipos(
  actingUser: string,
  superUser?: boolean
): Promise<GrupoEquipo[]> {
  const res = await fetch(`${BASE}/grupos-equipos`, {
    headers: headers(actingUser, superUser),
  });
  const body = await parseRes<{ data: GrupoEquipo[] }>(res);
  return body.data;
}

/** Grupos visibles para expandir ACL de la sesión actual. */
export async function fetchGruposEquiposPublic(
  actingUser: string
): Promise<GrupoEquipo[]> {
  const res = await fetch(`${BASE}/grupos-equipos/public`, {
    headers: headers(actingUser),
  });
  const body = await parseRes<{ data: GrupoEquipo[] }>(res);
  return body.data;
}

export async function createGrupoEquipo(
  input: Partial<GrupoEquipo>,
  actingUser: string,
  superUser?: boolean
): Promise<GrupoEquipo> {
  const res = await fetch(`${BASE}/grupos-equipos`, {
    method: 'POST',
    headers: headers(actingUser, superUser),
    body: JSON.stringify(input),
  });
  const body = await parseRes<{ data: GrupoEquipo }>(res);
  return body.data;
}

export async function updateGrupoEquipoOnServer(
  id: string,
  patch: Partial<GrupoEquipo>,
  actingUser: string,
  superUser?: boolean
): Promise<GrupoEquipo> {
  const res = await fetch(`${BASE}/grupos-equipos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(actingUser, superUser),
    body: JSON.stringify(patch),
  });
  const body = await parseRes<{ data: GrupoEquipo }>(res);
  return body.data;
}

export async function deleteGrupoEquipoOnServer(
  id: string,
  actingUser: string,
  superUser?: boolean
): Promise<void> {
  const res = await fetch(`${BASE}/grupos-equipos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(actingUser, superUser),
  });
  await parseRes(res);
}
