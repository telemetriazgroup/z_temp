import type { DeviceRangeEpisode } from './types';

const STORAGE_KEY = 'ztrack_range_episodes_v1';

function readAll(): DeviceRangeEpisode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DeviceRangeEpisode[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: DeviceRangeEpisode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getEpisode(rowKey: string): DeviceRangeEpisode | null {
  return readAll().find((e) => e.rowKey === rowKey) ?? null;
}

export function startEpisode(rowKey: string, startedAt: string): DeviceRangeEpisode {
  const episode: DeviceRangeEpisode = {
    rowKey,
    startedAt,
    lastSentUmbral: 0,
  };
  const all = readAll().filter((e) => e.rowKey !== rowKey);
  writeAll([...all, episode]);
  return episode;
}

export function clearEpisode(rowKey: string): void {
  writeAll(readAll().filter((e) => e.rowKey !== rowKey));
}

export function markUmbralSent(rowKey: string, umbralHoras: number): DeviceRangeEpisode {
  const all = readAll();
  const idx = all.findIndex((e) => e.rowKey === rowKey);
  if (idx === -1) {
    return startEpisode(rowKey, new Date().toISOString());
  }
  all[idx] = { ...all[idx], lastSentUmbral: umbralHoras };
  writeAll(all);
  return all[idx];
}

/** Horas transcurridas desde inicio del episodio (piso entero). */
export function episodeHoursElapsed(episode: DeviceRangeEpisode, now = new Date()): number {
  const start = new Date(episode.startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.floor((now.getTime() - start) / (60 * 60 * 1000));
}
