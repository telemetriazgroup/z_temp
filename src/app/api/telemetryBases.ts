/**
 * Bases para APIs de telemetría (Túnel/TermoKing comparten host; Starcool otro).
 * Van bajo el mismo prefijo que la SPA (`import.meta.env.BASE_URL`, ej. `/reefer/`)
 * para que un solo ProxyPass en Apache (`/reefer/` → backend) incluya también las APIs.
 *
 * Proxies: `vite.config.ts` (dev), `nginx.conf` (Docker).
 * URLs absolutas opcionales: `VITE_TUNEL_API_BASE`, `VITE_STARCOOL_API_BASE`.
 */
export const TELEMETRY_TUNEL_TERMOKING_BASE: string =
  import.meta.env.VITE_TUNEL_API_BASE ??
  `${import.meta.env.BASE_URL}telemetria/tunel-termoking`;

export const TELEMETRY_STARCOOL_BASE: string =
  import.meta.env.VITE_STARCOOL_API_BASE ??
  `${import.meta.env.BASE_URL}telemetria/starcool`;
