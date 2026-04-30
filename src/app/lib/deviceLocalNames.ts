const STORAGE_KEY = 'ztrack-listado-nombres-equipo';

export type DeviceLocalNameMap = Record<string, string>;

export function readDeviceLocalNames(): DeviceLocalNameMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as DeviceLocalNameMap;
  } catch {
    return {};
  }
}

export function persistDeviceLocalNames(map: DeviceLocalNameMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
