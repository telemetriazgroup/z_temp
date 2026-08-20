/**
 * Vite base es `/reefer/`. React Router (basename sin slash) a veces deja la URL en
 * `/reefer` sin barra final; F5/recarga falla porque la SPA vive bajo `/reefer/`.
 */
export function appBasePath(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function appBasenameNoSlash(): string {
  return appBasePath().replace(/\/$/, '') || '';
}

/** Si la URL es exactamente `/reefer`, corrige a `/reefer/` preservando query/hash. */
export function ensureBasenameTrailingSlash(): boolean {
  const withSlash = appBasePath();
  if (withSlash === '/') return false;
  const bare = withSlash.slice(0, -1);
  const { pathname, search, hash } = window.location;
  if (pathname === bare) {
    window.history.replaceState(
      window.history.state,
      '',
      `${withSlash}${search}${hash}`
    );
    return true;
  }
  return false;
}
