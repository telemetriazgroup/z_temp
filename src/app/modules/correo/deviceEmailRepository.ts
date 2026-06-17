import type { DeviceEmailConfig } from './types';

const STORAGE_KEY = 'ztrack_device_emails_v1';

function readAll(): DeviceEmailConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as DeviceEmailConfig[];
  } catch {
    return [];
  }
}

function writeAll(entries: DeviceEmailConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getDeviceEmailConfigs(): DeviceEmailConfig[] {
  return readAll();
}

export function getDeviceEmailConfig(rowKey: string): DeviceEmailConfig | null {
  return readAll().find((e) => e.rowKey === rowKey) ?? null;
}

export function upsertDeviceEmailConfig(
  entry: Omit<DeviceEmailConfig, 'emails'> & { emails: string[] }
): DeviceEmailConfig {
  const normalized: DeviceEmailConfig = {
    rowKey: entry.rowKey,
    imei: entry.imei,
    codigo: entry.codigo,
    emails: entry.emails.map((e) => e.trim()).filter(Boolean),
    enabled: entry.enabled,
  };
  const all = readAll();
  const idx = all.findIndex((e) => e.rowKey === normalized.rowKey);
  if (idx === -1) {
    writeAll([...all, normalized]);
  } else {
    all[idx] = normalized;
    writeAll(all);
  }
  return normalized;
}

export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}
