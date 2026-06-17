import type { DispositivoOrigenCodigo } from '../../types';
import type { User } from '../../types';
import { userHasFullDeviceAccess } from '../usuario/userPermissions';
import type { ControlComandoCambio, ControlEquipoSnapshot } from './commandSnapshot';

const STORAGE_KEY = 'ztrack_control_commands_v1';

export interface ControlCommandLogEntry {
  id: string;
  userId: string;
  username: string;
  imei: string;
  codigo: DispositivoOrigenCodigo | null;
  tipo: number;
  dato: number;
  /** Etiqueta legible: p. ej. "Temperatura −6 °C" */
  label: string;
  sentAt: string;
  success: boolean;
  responseSummary: string | null;
  error: string | null;
  /** Telemetría del equipo antes del comando. */
  estadoAnterior?: ControlEquipoSnapshot | null;
  /** Cambios concretos (antes → después) mostrados al confirmar. */
  cambios?: ControlComandoCambio[];
}

function readRaw(): ControlCommandLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ControlCommandLogEntry[];
  } catch {
    return [];
  }
}

function writeRaw(entries: ControlCommandLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function generateCommandLogId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function summarizeResponse(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 200 ? `${t.slice(0, 200)}…` : t;
  }
  try {
    const s = JSON.stringify(raw);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(raw);
  }
}

export function addControlCommandLog(entry: Omit<ControlCommandLogEntry, 'id'>): ControlCommandLogEntry {
  const created: ControlCommandLogEntry = { ...entry, id: generateCommandLogId() };
  const all = readRaw();
  all.unshift(created);
  writeRaw(all.slice(0, 500));
  return created;
}

export function getControlCommandLogs(): ControlCommandLogEntry[] {
  return readRaw();
}

export function getControlCommandLogsByImei(imei: string, limit = 20): ControlCommandLogEntry[] {
  return readRaw().filter((e) => e.imei === imei).slice(0, limit);
}

export function getControlCommandLogsByUser(userId: string, limit = 50): ControlCommandLogEntry[] {
  return readRaw().filter((e) => e.userId === userId).slice(0, limit);
}

/** Comandos visibles para el usuario: todos si acceso completo; si no, solo sus IMEI. */
export function getControlCommandLogsForUser(
  user: User | null,
  limit = 100
): ControlCommandLogEntry[] {
  const all = readRaw();
  if (user == null) return [];
  if (userHasFullDeviceAccess(user)) return all.slice(0, limit);
  const allowed = new Set(user.deviceAccess);
  return all.filter((e) => allowed.has(e.imei)).slice(0, limit);
}

export interface LogCommandParams {
  user: User;
  imei: string;
  codigo: DispositivoOrigenCodigo | null;
  tipo: number;
  dato: number;
  label: string;
  success: boolean;
  raw?: unknown;
  error?: string;
  estadoAnterior?: ControlEquipoSnapshot | null;
  cambios?: ControlComandoCambio[];
}

export function logControlCommand(params: LogCommandParams): ControlCommandLogEntry {
  return addControlCommandLog({
    userId: params.user.id,
    username: params.user.username,
    imei: params.imei,
    codigo: params.codigo,
    tipo: params.tipo,
    dato: params.dato,
    label: params.label,
    sentAt: new Date().toISOString(),
    success: params.success,
    responseSummary: params.success ? summarizeResponse(params.raw) : null,
    error: params.error ?? null,
    estadoAnterior: params.estadoAnterior ?? null,
    cambios: params.cambios ?? [],
  });
}
