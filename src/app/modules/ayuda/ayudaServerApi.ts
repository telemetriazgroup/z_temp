import type { AyudaSoporteContent } from './types';
import { defaultAyudaSoporteContent } from './types';

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

export async function fetchAyudaSoporte(): Promise<AyudaSoporteContent> {
  try {
    const res = await fetch(`${BASE}/ayuda-soporte`);
    const body = await parseRes<{ data: AyudaSoporteContent }>(res);
    return body.data ?? defaultAyudaSoporteContent();
  } catch {
    return defaultAyudaSoporteContent();
  }
}

export async function saveAyudaSoporte(
  content: AyudaSoporteContent,
  actingUser: string
): Promise<AyudaSoporteContent> {
  const res = await fetch(`${BASE}/ayuda-soporte`, {
    method: 'PUT',
    headers: headers(actingUser, true),
    body: JSON.stringify(content),
  });
  const body = await parseRes<{ data: AyudaSoporteContent }>(res);
  return body.data;
}
