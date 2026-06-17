import type { CorreoEnvioLog } from './types';

const STORAGE_KEY = 'ztrack_correo_envio_log_v1';
const MAX_ENTRIES = 500;

function readAll(): CorreoEnvioLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CorreoEnvioLog[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: CorreoEnvioLog[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
}

export function generateEnvioLogId(): string {
  return `envio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getCorreoEnvioLogs(limit = 100): CorreoEnvioLog[] {
  return readAll()
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, limit);
}

export function getEnvioLogsForDevice(rowKey: string, limit = 20): CorreoEnvioLog[] {
  return getCorreoEnvioLogs(limit).filter((l) => l.rowKey === rowKey);
}

export function wasUmbralSentInEpisode(
  rowKey: string,
  umbralHoras: number,
  episodeStartedAt: string
): boolean {
  return readAll().some(
    (l) =>
      l.rowKey === rowKey &&
      l.umbralHoras === umbralHoras &&
      l.success &&
      new Date(l.sentAt).getTime() >= new Date(episodeStartedAt).getTime()
  );
}

export function addCorreoEnvioLog(entry: Omit<CorreoEnvioLog, 'id'>): CorreoEnvioLog {
  const created: CorreoEnvioLog = { ...entry, id: generateEnvioLogId() };
  writeAll([created, ...readAll()]);
  return created;
}
