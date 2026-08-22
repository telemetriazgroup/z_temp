import type { HistorialVistaPrefs } from './types';
import { normalizeVistaPrefs, writeVistaPrefsLocal } from './prefsLocal';
import { defaultHistorialVistaPrefs } from './presets';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function headers(user?: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.trim()) h['X-ZTrack-User'] = user.trim();
  return h;
}

export async function fetchHistorialVistaPrefs(params: {
  username: string;
  imei: string;
  codigo?: string | null;
}): Promise<HistorialVistaPrefs> {
  const q = new URLSearchParams({ imei: params.imei });
  if (params.codigo) q.set('codigo', params.codigo);
  try {
    const res = await fetch(`${BASE}/historial-vista?${q}`, {
      headers: headers(params.username),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      data?: HistorialVistaPrefs | null;
    };
    if (res.ok && body.ok !== false && body.data) {
      const prefs = normalizeVistaPrefs(body.data);
      writeVistaPrefsLocal(params.username, params.imei, prefs);
      return prefs;
    }
  } catch {
    /* fallback local */
  }
  const { readVistaPrefsLocal } = await import('./prefsLocal');
  return (
    readVistaPrefsLocal(params.username, params.imei) ??
    defaultHistorialVistaPrefs()
  );
}

export async function saveHistorialVistaPrefs(params: {
  username: string;
  imei: string;
  codigo?: string | null;
  prefs: HistorialVistaPrefs;
}): Promise<HistorialVistaPrefs> {
  const payload = {
    imei: params.imei,
    codigo: params.codigo ?? undefined,
    ...params.prefs,
    updatedAt: new Date().toISOString(),
  };
  writeVistaPrefsLocal(params.username, params.imei, payload);
  try {
    const res = await fetch(`${BASE}/historial-vista`, {
      method: 'PUT',
      headers: headers(params.username),
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      data?: HistorialVistaPrefs;
      error?: string;
    };
    if (!res.ok || body.ok === false) {
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    return normalizeVistaPrefs(body.data ?? payload);
  } catch (e) {
    // Local ya guardado; re-lanzar si se quiere avisar
    if (e instanceof Error && e.message.startsWith('Error')) throw e;
    return normalizeVistaPrefs(payload);
  }
}
