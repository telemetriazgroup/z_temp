/**
 * Bases para APIs de telemetría.
 * - Túnel / TermoKing / Starcool2 → mismo host (proxy tunel-termoking).
 * - Starcool (legado) → host propio (proxy starcool).
 *
 * Proxies: `vite.config.ts` (dev), `nginx.conf` (Docker).
 * Overrides: `VITE_TUNEL_API_BASE`, `VITE_STARCOOL_API_BASE`, `VITE_STARCOOL2_API_BASE`.
 */
export const TELEMETRY_TUNEL_TERMOKING_BASE: string =
  import.meta.env.VITE_TUNEL_API_BASE ??
  `${import.meta.env.BASE_URL}telemetria/tunel-termoking`;

export const TELEMETRY_STARCOOL_BASE: string =
  import.meta.env.VITE_STARCOOL_API_BASE ??
  `${import.meta.env.BASE_URL}telemetria/starcool`;

/** StarCool API en 161.132.53.51:9051 (mismo host que Túnel). */
export const TELEMETRY_STARCOOL2_BASE: string =
  import.meta.env.VITE_STARCOOL2_API_BASE ?? TELEMETRY_TUNEL_TERMOKING_BASE;
