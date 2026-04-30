/**
 * Bases para APIs de telemetría (Túnel/TermoKing comparten host; Starcool otro).
 * Por defecto son rutas relativas al mismo origen → el navegador solo ve HTTPS en producción.
 * Proxies:
 * - `vite.config.ts` (dev / preview)
 * - `nginx.conf` (Docker / ztrack.app u otro front)
 *
 * Sustituir por URL absoluta en build (p. ej. otro API Gateway) con:
 * `VITE_TUNEL_API_BASE`, `VITE_STARCOOL_API_BASE`.
 */
export const TELEMETRY_TUNEL_TERMOKING_BASE: string =
  import.meta.env.VITE_TUNEL_API_BASE ?? '/telemetria/tunel-termoking';

export const TELEMETRY_STARCOOL_BASE: string =
  import.meta.env.VITE_STARCOOL_API_BASE ?? '/telemetria/starcool';
