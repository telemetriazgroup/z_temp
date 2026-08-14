import type { DashboardOverview } from '../modules/correo/types';

const FRESH_MS = 2 * 60 * 1000;

let cached: { overview: DashboardOverview; at: number; username: string } | null =
  null;

/** Guarda overview precargado en el login (splash). */
export function storePreloadedOverview(
  overview: DashboardOverview,
  username: string
): void {
  cached = {
    overview,
    at: Date.now(),
    username: username.trim().toLowerCase(),
  };
}

/**
 * Consume overview si es del mismo usuario y está fresco.
 * Al leerlo se limpia para no reutilizar datos viejos en un refresh manual.
 */
export function takePreloadedOverview(
  username?: string | null
): DashboardOverview | null {
  if (cached == null) return null;
  const key = (username ?? '').trim().toLowerCase();
  if (key && cached.username !== key) return null;
  if (Date.now() - cached.at > FRESH_MS) {
    cached = null;
    return null;
  }
  const { overview } = cached;
  cached = null;
  return overview;
}

export function peekPreloadedOverview(
  username?: string | null
): DashboardOverview | null {
  if (cached == null) return null;
  const key = (username ?? '').trim().toLowerCase();
  if (key && cached.username !== key) return null;
  if (Date.now() - cached.at > FRESH_MS) return null;
  return cached.overview;
}
