/**
 * Zona horaria de telemetría.
 * - Fuente API: marcas de tiempo sin offset = hora de pared GMT-5 (America/Lima).
 * - Visualización / inputs: `zona_horaria` del listado (GMT-4, GMT-5, …).
 */

export type TelemetryTzInfo = {
  /** IANA para Intl / toLocaleString */
  iana: string;
  /** Offset fijo para anexar a strings naive de la API (fuente). */
  sourceOffset: string;
  /** Etiqueta corta (GMT-4 / GMT-5). */
  label: string;
};

/** Fuente de telemetría / query API (siempre Lima / GMT-5). */
export const TELEMETRY_SOURCE_TZ: TelemetryTzInfo = {
  iana: 'America/Lima',
  sourceOffset: '-05:00',
  label: 'GMT-5',
};

function hasExplicitTimeZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim());
}

/** Resuelve zona de visualización a partir de `zona_horaria` del API. */
export function resolveDisplayTimeZone(
  zonaHoraria?: string | null
): TelemetryTzInfo {
  const z = (zonaHoraria ?? 'GMT-5').trim().toUpperCase().replace(/\s+/g, '');
  if (
    z === 'GMT-4' ||
    z === 'UTC-4' ||
    z === '-04:00' ||
    z.includes('CARACAS') ||
    z.includes('LA_PAZ') ||
    z.includes('SANTIAGO')
  ) {
    return {
      iana: 'America/Caracas',
      sourceOffset: '-04:00',
      label: 'GMT-4',
    };
  }
  if (z === 'GMT-5' || z === 'UTC-5' || z === '-05:00' || z.includes('LIMA')) {
    return TELEMETRY_SOURCE_TZ;
  }
  // IANA directo si viene así
  if (zonaHoraria?.includes('/')) {
    const offset = z.includes('4') ? '-04:00' : '-05:00';
    return {
      iana: zonaHoraria.trim(),
      sourceOffset: offset,
      label: z.startsWith('GMT') ? z : zonaHoraria.trim(),
    };
  }
  return TELEMETRY_SOURCE_TZ;
}

/** Parsea fecha de telemetría: naive → GMT-5 (fuente). */
export function parseTelemetryDateClient(value: string | Date | null | undefined): Date {
  if (value == null || value === '') return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return new Date(NaN);
  if (hasExplicitTimeZone(s)) return new Date(s);
  return new Date(`${s}${TELEMETRY_SOURCE_TZ.sourceOffset}`);
}

export function parseTelemetryTimestampClient(
  value: string | Date | null | undefined
): number {
  const t = parseTelemetryDateClient(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function partsInTz(d: Date, iana: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: iana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of formatter.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  // hour12:false a veces da "24"
  if (out.hour === '24') out.hour = '00';
  return out;
}

/** Formato API telemetría `YYYY-MM-DD_HH-MM-SS` en zona fuente (GMT-5). */
export function formatoFechaQueryApiTz(d: Date = new Date()): string {
  const p = partsInTz(d, TELEMETRY_SOURCE_TZ.iana);
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/** Valor para `<input type="datetime-local">` en zona de visualización. */
export function dateToDatetimeLocalInTz(d: Date, displayIana: string): string {
  const p = partsInTz(d, displayIana);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Interpreta un valor datetime-local como hora de pared en `displayIana`
 * y devuelve el Instant correspondiente.
 */
export function parseDatetimeLocalInTz(
  value: string,
  display: TelemetryTzInfo
): Date | null {
  if (!value) return null;
  const m = value
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
    );
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  // Construye ISO con offset de visualización (fijo GMT-4/GMT-5).
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${display.sourceOffset}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Últimas `horas` como strings datetime-local en zona de visualización. */
export function rangoUltimasHorasInTz(
  horas: number,
  display: TelemetryTzInfo,
  ahora: Date = new Date()
): { desde: string; hasta: string } {
  const fin = ahora;
  const ini = new Date(fin.getTime() - horas * 60 * 60 * 1000);
  return {
    desde: dateToDatetimeLocalInTz(ini, display.iana),
    hasta: dateToDatetimeLocalInTz(fin, display.iana),
  };
}

export function formatDateTimeInTz(
  value: string | Date | null | undefined,
  displayIana: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseTelemetryDateClient(value);
  if (Number.isNaN(d.getTime())) {
    return value == null ? '—' : String(value);
  }
  return d.toLocaleString('es-PE', {
    timeZone: displayIana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  });
}

export function formatDateInTz(
  value: string | Date | null | undefined,
  displayIana: string
): string {
  const d =
    value instanceof Date ? value : parseTelemetryDateClient(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', {
    timeZone: displayIana,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
