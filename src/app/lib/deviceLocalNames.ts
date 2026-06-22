const STORAGE_KEY = 'ztrack-listado-nombres-equipo';
const HISTORY_KEY = 'ztrack-listado-nombres-historial';
const MAX_HISTORY = 500;

export type DeviceLocalNameMap = Record<string, string>;

export interface DeviceLocalNameHistoryEntry {
  id: string;
  rowKey: string;
  imei: string;
  codigo?: string;
  nombreAnterior: string;
  nombreNuevo: string;
  changedAt: string;
  /** Usuario que realizó el cambio (si está disponible). */
  usuario?: string;
}

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

export function readDeviceLocalNameHistory(): DeviceLocalNameHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DeviceLocalNameHistoryEntry =>
        e != null &&
        typeof e === 'object' &&
        typeof (e as DeviceLocalNameHistoryEntry).rowKey === 'string'
    );
  } catch {
    return [];
  }
}

function persistDeviceLocalNameHistory(entries: DeviceLocalNameHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

/** Registra un cambio de nombre si el valor efectivo cambió. */
export function recordDeviceLocalNameChange(params: {
  rowKey: string;
  imei: string;
  codigo?: string;
  nombreAnterior: string;
  nombreNuevo: string;
  usuario?: string;
}): DeviceLocalNameHistoryEntry | null {
  const prev = params.nombreAnterior.trim();
  const next = params.nombreNuevo.trim();
  if (prev === next) return null;

  const entry: DeviceLocalNameHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rowKey: params.rowKey,
    imei: params.imei,
    codigo: params.codigo,
    nombreAnterior: prev || '—',
    nombreNuevo: next || '—',
    changedAt: new Date().toISOString(),
    usuario: params.usuario?.trim() || undefined,
  };

  const all = readDeviceLocalNameHistory();
  persistDeviceLocalNameHistory([entry, ...all]);
  return entry;
}

export function getDeviceLocalNameHistoryForRow(
  rowKey: string,
  limit = 20
): DeviceLocalNameHistoryEntry[] {
  return readDeviceLocalNameHistory()
    .filter((e) => e.rowKey === rowKey)
    .slice(0, limit);
}
