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

export function resolveAlarmTitle(
  catalogId: string | null,
  alarmCode: number,
  model = 'MP4000'
): string {
  if (catalogId) {
    const byId = getAlarmCatalogById(catalogId);
    if (byId) return byId.titleEs;
  }
  const byCode = getAlarmCatalogByCode(alarmCode, model);
  if (byCode) return byCode.titleEs;
  return `Alarma código ${alarmCode}`;
}

export function formatAlarmCodeLabel(code: number | null | undefined): string {
  if (!isActiveAlarmCode(code)) return 'Sin alarma activa';
  return `Código ${code}`;
}
