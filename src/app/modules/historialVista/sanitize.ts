import type { DatoOficialHistorial } from '../../types';
import { getHistorialFieldDef } from './catalog';
import type { HistorialFieldDef } from './types';

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return null;
  return n;
}

/** Valor crudo del row (incluye power override / battery). */
export function rawFieldValue(
  row: DatoOficialHistorial,
  def: HistorialFieldDef
): number | null {
  if (def.transform === 'power_state_override') {
    return resolvePowerState(row);
  }
  let n = toNum((row as Record<string, unknown>)[def.key]);
  if (n == null) return null;
  if (def.transform === 'battery_div10' && n > 10) {
    n = n / 10;
  }
  return n;
}

/**
 * Power: 1 = ON, 0 = OFF.
 * Si alguna fase > 0.5 → ON aunque power_state diga 0.
 */
export function resolvePowerState(row: DatoOficialHistorial): number | null {
  const ph1 = toNum(row.consumption_ph_1) ?? 0;
  const ph2 = toNum(row.consumption_ph_2) ?? 0;
  const ph3 = toNum(row.consumption_ph_3) ?? 0;
  if (ph1 > 0.5 || ph2 > 0.5 || ph3 > 0.5) return 1;
  const ps = toNum(row.power_state);
  if (ps == null) return null;
  return ps === 1 ? 1 : 0;
}

function inRange(n: number, def: HistorialFieldDef): boolean {
  if (def.transform === 'power_kwh_min') {
    return n > 0.1;
  }
  if (def.min != null && n < def.min) return false;
  if (
    def.max != null &&
    Number.isFinite(def.max) &&
    n > def.max
  ) {
    return false;
  }
  return true;
}

/** Para gráfica: fuera de rango o inválido → null (no dibuja). */
export function sanitizeChartValue(
  row: DatoOficialHistorial,
  key: string
): number | null {
  const def = getHistorialFieldDef(key);
  if (!def?.chartable) return null;
  const n = rawFieldValue(row, def);
  if (n == null) return null;
  if (!inRange(n, def)) return null;
  return n;
}

/**
 * Para tabla: null vacío → "—"; fuera de rango → "NA"; power → Encendido/Apagado.
 */
export function sanitizeTableValue(
  row: DatoOficialHistorial,
  key: string
): number | 'NA' | null | string {
  const def = getHistorialFieldDef(key);
  if (!def) {
    const n = toNum((row as Record<string, unknown>)[key]);
    return n;
  }
  if (def.transform === 'power_state_override') {
    const ps = resolvePowerState(row);
    if (ps == null) return null;
    return ps === 1 ? 'Encendido' : 'Apagado';
  }
  const n = rawFieldValue(row, def);
  if (n == null) return null;
  if (!inRange(n, def)) return 'NA';
  return n;
}

export function formatSanitizedTableCell(
  sanitized: number | 'NA' | null | string,
  def: HistorialFieldDef | undefined,
  formatTemp: (celsius: number) => string
): string {
  if (sanitized === 'NA') return 'NA';
  if (sanitized == null) return '—';
  if (typeof sanitized === 'string') return sanitized;
  if (def?.axis === 'temp' || def?.unit === '°C') {
    return formatTemp(sanitized);
  }
  if (def?.unit === '%') return `${sanitized.toFixed(1)} %`;
  if (def?.unit === 'A' || def?.unit === 'V' || def?.unit === 'Hz') {
    return `${Number.isInteger(sanitized) ? sanitized : sanitized.toFixed(1)} ${def.unit}`;
  }
  if (def?.unit === 'kWh' || def?.unit === 'cfm' || def?.unit === 'ppm') {
    return `${sanitized.toFixed(def.unit === 'ppm' ? 0 : 1)} ${def.unit}`;
  }
  return String(sanitized);
}
