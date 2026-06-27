/** Zona horaria operativa (Perú / telemetría GMT-5). */
export const CORREO_TZ = process.env.CORREO_TZ ?? 'America/Lima';

/** Offset fijo Perú (sin DST). Debe coincidir con CORREO_TZ. */
const TELEMETRY_TZ_OFFSET = '-05:00';

function hasExplicitTimeZone(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(s);
}

/**
 * Parsea fechas de telemetría/API.
 * Sin sufijo Z/±hh:mm se interpreta como hora local GMT-5 (America/Lima),
 * independiente de la TZ del proceso (p. ej. Docker en UTC).
 */
export function parseTelemetryDate(value) {
  if (value == null || value === '') return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return new Date(NaN);
  if (hasExplicitTimeZone(s)) return new Date(s);
  return new Date(`${s}${TELEMETRY_TZ_OFFSET}`);
}

export function parseTelemetryTimestamp(value) {
  const t = parseTelemetryDate(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function partsInTz(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CORREO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const out = {};
  for (const p of formatter.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** YYYY-MM-DD en GMT-5. */
export function todayKey(d = new Date()) {
  const p = partsInTz(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function yesterdayKey(d = new Date()) {
  const p = partsInTz(d);
  const utc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const prev = new Date(utc - 86400000);
  return todayKey(prev);
}

/** Formato API telemetría: `2026-04-29_20-11-11` en GMT-5. */
export function formatoFechaQueryApi(d = new Date()) {
  const p = partsInTz(d);
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/** Texto legible en GMT-5. */
export function formatDateTimeTz(iso, options = {}) {
  if (iso == null) return '—';
  const d = iso instanceof Date ? iso : parseTelemetryDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    timeZone: CORREO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/** YYYY/MM/DD en GMT-5 (asunto correo). */
export function formatDateSubjectTz(d = new Date()) {
  const p = partsInTz(d);
  return `${p.year}/${p.month}/${p.day}`;
}
