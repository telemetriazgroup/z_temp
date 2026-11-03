import type { UltimoEstadoDispositivosResponse } from '../types';
import { resumenFromDispositivos } from '../modules/usuario/listResumen';
import type { DispositivoUltimoEstado } from '../types';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function sessionHeaders(): HeadersInit {
  const h: Record<string, string> = {};
  try {
    const raw = localStorage.getItem('ztrack_user');
    if (!raw) return h;
    const user = JSON.parse(raw) as {
      username?: string;
      superUser?: boolean;
      category?: string;
    };
    if (user.username?.trim()) h['X-ZTrack-User'] = user.username.trim();
    if (user.superUser === true || user.category === 'superadmin') {
      h['X-ZTrack-Super-User'] = 'true';
    }
  } catch {
    // sin sesión: el servidor responde según el header ausente
  }
  return h;
}

/**
 * Flota ya guardada por la sincronización del servidor.
 * El navegador no consulta Túnel, StarCool ni TermoKing.
 */
export async function fetchUltimoEstadoDispositivos(): Promise<UltimoEstadoDispositivosResponse> {
  const res = await fetch(`${BASE}/dashboard/fleet`, { headers: sessionHeaders() });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: {
      dispositivos?: DispositivoUltimoEstado[];
      zona_horaria?: string;
      telemetryError?: string | null;
    };
  };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  const dispositivos = body.data?.dispositivos ?? [];
  if (dispositivos.length === 0 && body.data?.telemetryError) {
    throw new Error(body.data.telemetryError);
  }
  const zona = body.data?.zona_horaria ?? 'GMT-5';
  return {
    data: {
      resumen: resumenFromDispositivos(dispositivos, zona),
      dispositivos,
    },
  };
}
