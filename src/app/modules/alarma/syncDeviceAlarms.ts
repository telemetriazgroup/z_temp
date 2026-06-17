import type { DispositivoUltimoEstado } from '../../types';
import type { DeviceAlarmEvent } from './types';
import { ensureAlarmCatalog, getAlarmCatalogByCode } from './alarmCatalogRepository';
import { extractActiveAlarmCodes } from './alarmSlots';
import {
  activeAlarmKey,
  addDeviceAlarmEvent,
  getDeviceAlarmEvents,
  updateDeviceAlarmEvent,
} from './deviceAlarmRepository';

/**
 * Sincroniza eventos locales con el último estado de dispositivos.
 * Usa numero_alarma y alarma_01… con códigos válidos (>0).
 */
export function syncDeviceAlarmsFromTelemetry(
  dispositivos: DispositivoUltimoEstado[],
  model = 'MP4000'
): DeviceAlarmEvent[] {
  ensureAlarmCatalog();
  const events = getDeviceAlarmEvents();
  const activeKeys = new Set<string>();
  const now = new Date().toISOString();

  for (const d of dispositivos) {
    const codes = extractActiveAlarmCodes(d.ultimo_dato);
    for (const { code } of codes) {
      const key = activeAlarmKey(d.imei, d.codigo, code);
      activeKeys.add(key);

      const open = events.find(
        (e) =>
          e.clearedAt == null &&
          activeAlarmKey(e.imei, e.codigo, e.alarmCode) === key
      );

      if (open == null) {
        const catalog = getAlarmCatalogByCode(code, model);
        addDeviceAlarmEvent({
          imei: d.imei,
          codigo: d.codigo ?? null,
          alarmCode: code,
          catalogId: catalog?.id ?? null,
          detectedAt: d.ultimo_dato?.created_at ?? d.ultima_actualizacion ?? now,
          clearedAt: null,
          atendida: false,
          reportadaEmail: false,
        });
      }
    }
  }

  for (const e of events) {
    if (e.clearedAt != null) continue;
    const key = activeAlarmKey(e.imei, e.codigo, e.alarmCode);
    if (!activeKeys.has(key)) {
      updateDeviceAlarmEvent(e.id, { clearedAt: now });
    }
  }

  return getDeviceAlarmEvents();
}
