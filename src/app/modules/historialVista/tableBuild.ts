import type { DatoOficialHistorial } from '../../types';
import { formatTemperatura, type TemperaturaUnidad } from '../../lib/temperatureUnit';
import {
  formatDateTimeInTz,
  resolveDisplayTimeZone,
} from '../../lib/telemetryTimezone';
import { getHistorialFieldDef } from './catalog';
import {
  formatSanitizedTableCell,
  sanitizeTableValue,
} from './sanitize';
import type { HistorialFieldDef } from './types';

/** Fecha siempre primera; luego keys tableable del perfil. */
export function resolveTableColumnKeys(tableKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of tableKeys) {
    const def = getHistorialFieldDef(key);
    if (!def?.tableable) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function tableColumnHeader(
  key: string,
  unidad: TemperaturaUnidad
): string {
  const def = getHistorialFieldDef(key);
  if (!def) return key;
  if (def.axis === 'temp' || def.unit === '°C') {
    return `${def.label} (°${unidad})`;
  }
  return def.label;
}

export function fieldDefForTableKey(key: string): HistorialFieldDef | undefined {
  return getHistorialFieldDef(key);
}

export function fechaRegistroRaw(row: DatoOficialHistorial): string | null {
  const c = row.created_at;
  if (c != null && String(c).trim() !== '') return String(c);
  const f = row.fecha;
  if (f != null && String(f).trim() !== '') return String(f);
  return null;
}

export function celdaVistaHistorial(
  row: DatoOficialHistorial,
  key: string,
  zonaHoraria?: string | null,
  unidad: TemperaturaUnidad = 'C'
): string {
  if (key === 'fecha_registro') {
    const raw = fechaRegistroRaw(row);
    if (raw == null) return '—';
    return formatDateTimeInTz(raw, resolveDisplayTimeZone(zonaHoraria).iana);
  }
  const def = getHistorialFieldDef(key);
  const sanitized = sanitizeTableValue(row, key);
  return formatSanitizedTableCell(sanitized, def, (c) =>
    formatTemperatura(c, unidad)
  );
}
