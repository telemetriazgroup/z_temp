import type { DispositivoOrigenCodigo } from '../../types';
import type { DeviceAlarmEvent } from './types';
import { getAlarmCatalogByCode } from './alarmCatalogRepository';

const STORAGE_KEY = 'ztrack_device_alarms_v1';

function readRaw(): DeviceAlarmEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as DeviceAlarmEvent[];
  } catch {
    return [];
  }
}

function writeRaw(events: DeviceAlarmEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function generateDeviceAlarmId(): string {
  return `dev-alarm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getDeviceAlarmEvents(): DeviceAlarmEvent[] {
  return readRaw().sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
}

export function getActiveDeviceAlarmEvents(): DeviceAlarmEvent[] {
  return getDeviceAlarmEvents().filter((e) => e.clearedAt == null);
}

export function getDeviceAlarmEventsByImei(imei: string): DeviceAlarmEvent[] {
  return getDeviceAlarmEvents().filter((e) => e.imei === imei);
}

export function addDeviceAlarmEvent(
  event: Omit<DeviceAlarmEvent, 'id'>
): DeviceAlarmEvent {
  const created: DeviceAlarmEvent = { ...event, id: generateDeviceAlarmId() };
  writeRaw([...readRaw(), created]);
  return created;
}

export function updateDeviceAlarmEvent(
  id: string,
  patch: Partial<DeviceAlarmEvent>
): DeviceAlarmEvent {
  const events = readRaw();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Evento de alarma no encontrado');
  const next = { ...events[idx], ...patch };
  events[idx] = next;
  writeRaw(events);
  return next;
}

export function deleteDeviceAlarmEvent(id: string): void {
  writeRaw(readRaw().filter((e) => e.id !== id));
}

/** `numero_alarma` en telemetría: null/0 = sin alarma activa; otro valor = código MP4000. */
export function isActiveAlarmCode(code: number | null | undefined): code is number {
  return code != null && !Number.isNaN(code) && code !== 0;
}

export function activeAlarmKey(
  imei: string,
  codigo: DispositivoOrigenCodigo | null | undefined,
  alarmCode: number
): string {
  return `${codigo ?? 'UNK'}::${imei}::${alarmCode}`;
}
