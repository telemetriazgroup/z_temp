import type { DispositivoUltimoEstado } from '../../types';
import type { AlarmCatalogEntry } from './types';
import { getAlarmCatalogByCode, getAlarmCatalogById } from './alarmCatalogRepository';
import { isActiveAlarmCode } from './deviceAlarmRepository';
import { extractActiveAlarmCodes } from './alarmSlots';

export function resolveAlarmCatalogForCode(
  code: number | null | undefined,
  model = 'MP4000'
): AlarmCatalogEntry | null {
  if (!isActiveAlarmCode(code)) return null;
  return getAlarmCatalogByCode(code, model) ?? null;
}

export function resolveAlarmCatalogForDevice(
  dispositivo: DispositivoUltimoEstado,
  model = 'MP4000'
): AlarmCatalogEntry | null {
  const slots = extractActiveAlarmCodes(dispositivo.ultimo_dato);
  for (const { code } of slots) {
    const cat = getAlarmCatalogByCode(code, model);
    if (cat) return cat;
  }
  const first = slots[0];
  if (first) return getAlarmCatalogByCode(first.code, model) ?? null;
  return resolveAlarmCatalogForCode(dispositivo.ultimo_dato?.numero_alarma, model);
}

function resolveEntry(
  catalogId: string | null,
  alarmCode: number,
  model = 'MP4000'
): AlarmCatalogEntry | undefined {
  if (catalogId) {
    const byId = getAlarmCatalogById(catalogId);
    if (byId) return byId;
  }
  return getAlarmCatalogByCode(alarmCode, model);
}

/** Título técnico (admin/superadmin / documentación). */
export function resolveAlarmTitle(
  catalogId: string | null,
  alarmCode: number,
  model = 'MP4000'
): string {
  const entry = resolveEntry(catalogId, alarmCode, model);
  if (entry) return entry.titleEs;
  return `Alarma código ${alarmCode}`;
}

/**
 * Texto mostrado al usuario estándar: `mensajeUsuario`.
 * Si está vacío, cae a título técnico.
 */
export function resolveAlarmMensajeUsuario(
  catalogId: string | null,
  alarmCode: number,
  model = 'MP4000'
): string {
  const entry = resolveEntry(catalogId, alarmCode, model);
  if (entry) {
    const msg = entry.mensajeUsuario?.trim();
    if (msg) return msg;
    return entry.titleEs;
  }
  return `Alarma código ${alarmCode}`;
}

/** Etiqueta según rol: usuario → mensaje simple; admin/super → título técnico. */
export function resolveAlarmDisplayLabel(
  catalogId: string | null,
  alarmCode: number,
  opts?: { technical?: boolean; model?: string }
): string {
  const model = opts?.model ?? 'MP4000';
  if (opts?.technical) return resolveAlarmTitle(catalogId, alarmCode, model);
  return resolveAlarmMensajeUsuario(catalogId, alarmCode, model);
}

export function formatAlarmCodeLabel(code: number | null | undefined): string {
  if (!isActiveAlarmCode(code)) return 'Sin alarma activa';
  return `Código ${code}`;
}
