import type { DatoOficialHistorial } from '../../types';
import { powerStateEfectivo } from '../../lib/powerEfectivo';
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
  def: HistorialFieldDef,
  codigo?: string | null
): number | null {
  if (def.transform === 'power_state_override') {
    return resolvePowerState(row, codigo);
  }
  let n = toNum((row as Record<string, unknown>)[def.key]);
  if (n == null) return null;
  if (def.transform === 'battery_div10' && n > 10) {
    n = n / 10;
  }
  return n;
}

/**
 * Power efectivo: 1 = ON, 0 = OFF.
 * Thermoking y TUNEL: cualquier fase > 0.1 A anula un apagado.
 * Starcool: suministro y retorno alrededor del setpoint.
 */
export function resolvePowerState(
  row: DatoOficialHistorial,
  codigo?: string | null
): number | null {
  return powerStateEfectivo(row, codigo);
}

function inRange(n: number, def: HistorialFieldDef, lado: 'chart' | 'table' = 'table'): boolean {
  if (def.transform === 'power_kwh_min') {
    return n > 0.1;
  }
  const min = lado === 'chart' && def.chartMin != null ? def.chartMin : def.min;
  if (min != null && n < min) return false;
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
  key: string,
  codigo?: string | null
): number | null {
  const def = getHistorialFieldDef(key);
  if (!def?.chartable) return null;
  const n = rawFieldValue(row, def, codigo);
  if (n == null) return null;
  if (!inRange(n, def, 'chart')) return null;
  return n;
}

/**
 * Para tabla: null vacío → "—"; fuera de rango → "NA"; power → Encendido/Apagado.
 */
export function sanitizeTableValue(
  row: DatoOficialHistorial,
  key: string,
  codigo?: string | null
): number | 'NA' | null | string {
  const def = getHistorialFieldDef(key);
  if (!def) {
    const n = toNum((row as Record<string, unknown>)[key]);
    return n;
  }
  if (def.transform === 'power_state_override') {
    const ps = resolvePowerState(row, codigo);
    if (ps == null) return null;
    return ps === 1 ? 'Encendido' : 'Apagado';
  }
  const n = rawFieldValue(row, def, codigo);
  if (n == null) return null;
  if (!inRange(n, def)) {
    const usda = def.key.startsWith('cargo_') && def.key.endsWith('_temp');
    if (def.key === 'evaporation_coil' || usda) return null;
    return 'NA';
  }
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
