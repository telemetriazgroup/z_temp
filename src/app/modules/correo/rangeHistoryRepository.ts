import type { RangePollSnapshot, HourlyRangeBucket } from './types';

const POLL_KEY = 'ztrack_range_polls_v1';
const HOUR_KEY = 'ztrack_range_hourly_v1';
const MAX_POLL_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_HOUR_BUCKETS = 12;

function readPolls(): RangePollSnapshot[] {
  try {
    const raw = localStorage.getItem(POLL_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RangePollSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writePolls(items: RangePollSnapshot[]): void {
  localStorage.setItem(POLL_KEY, JSON.stringify(items));
}

function readHourly(): HourlyRangeBucket[] {
  try {
    const raw = localStorage.getItem(HOUR_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HourlyRangeBucket[]) : [];
  } catch {
    return [];
  }
}

function writeHourly(items: HourlyRangeBucket[]): void {
  localStorage.setItem(HOUR_KEY, JSON.stringify(items));
}

export function hourKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
}

function pruneOldPolls(items: RangePollSnapshot[]): RangePollSnapshot[] {
  const cutoff = Date.now() - MAX_POLL_AGE_MS;
  return items.filter((p) => new Date(p.recordedAt).getTime() >= cutoff);
}

function pruneHourly(items: HourlyRangeBucket[]): HourlyRangeBucket[] {
  const byDevice = new Map<string, HourlyRangeBucket[]>();
  for (const b of items) {
    const list = byDevice.get(b.rowKey) ?? [];
    list.push(b);
    byDevice.set(b.rowKey, list);
  }
  const out: HourlyRangeBucket[] = [];
  for (const list of byDevice.values()) {
    list.sort((a, b) => b.hourKey.localeCompare(a.hourKey));
    out.push(...list.slice(0, MAX_HOUR_BUCKETS));
  }
  return out;
}

/** Registra lectura y actualiza bucket horario (últimas 12 h). */
export function recordRangePoll(rowKey: string, enRango: boolean | null): void {
  const now = new Date();
  const recordedAt = now.toISOString();
  const polls = pruneOldPolls([
    ...readPolls().filter((p) => p.rowKey !== rowKey || p.recordedAt !== recordedAt),
    { rowKey, enRango, recordedAt },
  ]);
  writePolls(polls);

  const hk = hourKeyOf(now);
  const hourly = readHourly();
  const idx = hourly.findIndex((b) => b.rowKey === rowKey && b.hourKey === hk);
  if (idx === -1) {
    hourly.push({
      rowKey,
      hourKey: hk,
      enRango,
      sampleCount: 1,
      updatedAt: recordedAt,
    });
  } else {
    const prev = hourly[idx];
    hourly[idx] = {
      ...prev,
      enRango,
      sampleCount: prev.sampleCount + 1,
      updatedAt: recordedAt,
    };
  }
  writeHourly(pruneHourly(hourly));
}

export function getHourlyBuckets(rowKey: string): HourlyRangeBucket[] {
  return readHourly()
    .filter((b) => b.rowKey === rowKey)
    .sort((a, b) => b.hourKey.localeCompare(a.hourKey))
    .slice(0, MAX_HOUR_BUCKETS);
}

/**
 * Horas consecutivas fuera de rango según historial horario (máx. 12 h).
 * Requiere que el equipo esté actualmente fuera de rango.
 */
export function consecutiveHoursOutOfRange(
  rowKey: string,
  currentlyOut: boolean
): number {
  if (!currentlyOut) return 0;

  const buckets = getHourlyBuckets(rowKey);
  if (buckets.length === 0) return 1;

  const currentHk = hourKeyOf(new Date());
  let count = 0;
  let expected = currentHk;

  for (const bucket of buckets) {
    if (bucket.hourKey !== expected) break;
    if (bucket.enRango !== false) break;
    count++;
    expected = previousHourKey(expected);
  }

  return Math.max(count, 1);
}

function previousHourKey(hk: string): string {
  const [datePart, hourPart] = hk.split('T');
  const d = new Date(`${datePart}T${hourPart}:00:00`);
  d.setHours(d.getHours() - 1);
  return hourKeyOf(d);
}

export function getRecentPolls(rowKey: string, limit = 30): RangePollSnapshot[] {
  return readPolls()
    .filter((p) => p.rowKey === rowKey)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, limit);
}
