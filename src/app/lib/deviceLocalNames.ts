import {
  fetchDeviceNamesFromServer,
  saveDeviceNameOnServer,
} from '../modules/correo/correoServerApi';

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

/** Caché en memoria sincronizada con el servidor (fuente de verdad compartida). */
let serverNamesCache: DeviceLocalNameMap | null = null;

function readLocalStorageNames(): DeviceLocalNameMap {
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

export function readDeviceLocalNames(): DeviceLocalNameMap {
  if (serverNamesCache != null) return serverNamesCache;
  return readLocalStorageNames();
}

export function persistDeviceLocalNames(map: DeviceLocalNameMap): void {
  serverNamesCache = { ...map };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Actualiza caché local tras cargar desde servidor. */
export function applyServerDeviceNames(namesByRowKey: Record<string, string>): DeviceLocalNameMap {
  const map: DeviceLocalNameMap = {};
  for (const [rowKey, name] of Object.entries(namesByRowKey)) {
    const trimmed = name?.trim();
    if (trimmed && trimmed !== 'SIN ASIGNAR') map[rowKey] = trimmed;
  }
  persistDeviceLocalNames(map);
  return map;
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

/** Registra historial en caché local (el servidor es la fuente de verdad). */
export function recordDeviceLocalNameChange(params: {
  rowKey: string;
  imei: string;
  codigo?: string;
  nombreAnterior: string;
  nombreNuevo: string;
  usuario?: string;
  historyEntry?: DeviceLocalNameHistoryEntry | null;
}): DeviceLocalNameHistoryEntry | null {
  const prev = params.nombreAnterior.trim();
  const next = params.nombreNuevo.trim();
  if (prev === next && !params.historyEntry) return null;

  const entry: DeviceLocalNameHistoryEntry =
    params.historyEntry ??
    ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rowKey: params.rowKey,
      imei: params.imei,
      codigo: params.codigo,
      nombreAnterior: prev || '—',
      nombreNuevo: next || '—',
      changedAt: new Date().toISOString(),
      usuario: params.usuario?.trim() || undefined,
    } satisfies DeviceLocalNameHistoryEntry);

  const all = readDeviceLocalNameHistory();
  persistDeviceLocalNameHistory([entry, ...all.filter((e) => e.id !== entry.id)]);
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

/** Aplica historial recibido del servidor al caché local del equipo. */
export function applyServerDeviceNameHistory(
  rowKey: string,
  entries: DeviceLocalNameHistoryEntry[]
): DeviceLocalNameHistoryEntry[] {
  const rest = readDeviceLocalNameHistory().filter((e) => e.rowKey !== rowKey);
  persistDeviceLocalNameHistory([...entries, ...rest]);
  return entries;
}

/** Carga nombres del servidor (compartidos entre usuarios/equipos) y migra caché local pendiente. */
export async function refreshDeviceNamesFromServer(): Promise<DeviceLocalNameMap> {
  const localBefore = readLocalStorageNames();
  let serverMap = await fetchDeviceNamesFromServer();

  for (const [rowKey, name] of Object.entries(localBefore)) {
    const trimmed = name?.trim();
    if (!trimmed || trimmed === 'SIN ASIGNAR' || serverMap[rowKey]) continue;
    const dash = rowKey.indexOf('-');
    const codigo = dash >= 0 ? rowKey.slice(0, dash) : undefined;
    const imei = dash >= 0 ? rowKey.slice(dash + 1) : rowKey;
    try {
      await saveDeviceNameOnServer({ rowKey, imei, codigo, name: trimmed, usuario: 'migracion-local' });
      serverMap = { ...serverMap, [rowKey]: trimmed };
    } catch {
      /* servidor no disponible: se conserva caché local */
    }
  }

  return applyServerDeviceNames(serverMap);
}
