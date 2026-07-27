import { parseTelemetryTimestamp } from '../timezone.js';
import { timestampRegistroHistorial } from '../historicalTelemetry.js';

export const GAP_MS = 2 * 60 * 60 * 1000;
const MS_HORA = 60 * 60 * 1000;

/**
 * Intervalos sin transmisión: Δt entre muestras consecutivas > 2 h.
 * @returns {{ since: string, until: string, durationHours: number }[]}
 */
export function computeSinTransmisionIntervals(datos) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({ ts: timestampRegistroHistorial(row), row }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  const intervals = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const delta = cur.ts - prev.ts;
    if (delta > GAP_MS) {
      intervals.push({
        since: new Date(prev.ts).toISOString(),
        until: new Date(cur.ts).toISOString(),
        durationHours: Math.round((delta / MS_HORA) * 10) / 10,
      });
    }
  }
  return intervals;
}

export function eventHash(tipo, since, until) {
  return `${tipo}|${since}|${until ?? 'open'}`;
}

/** Solape de dos intervalos [a0,a1] [b0,b1] en ms (null until = openEnd). */
export function overlapMs(aSince, aUntil, bSince, bUntil, openEnd = Date.now()) {
  const a0 = parseTelemetryTimestamp(aSince);
  const a1 = aUntil == null ? openEnd : parseTelemetryTimestamp(aUntil);
  const b0 = parseTelemetryTimestamp(bSince);
  const b1 = bUntil == null ? openEnd : parseTelemetryTimestamp(bUntil);
  if ([a0, a1, b0, b1].some((n) => Number.isNaN(n))) return 0;
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  return Math.max(0, end - start);
}

export function shouldPreserveClassification(prev, next, openEnd = Date.now()) {
  if (prev.clasificacion == null || prev.clasificacion === 'sin_clasificar') {
    return false;
  }
  if (prev.tipo !== next.tipo) return false;
  const prevDur =
    (prev.until_at == null ? openEnd : parseTelemetryTimestamp(prev.until_at)) -
    parseTelemetryTimestamp(prev.since_at);
  if (prevDur <= 0) return false;
  const ov = overlapMs(
    prev.since_at,
    prev.until_at,
    next.since,
    next.until,
    openEnd
  );
  return ov / prevDur >= 0.5;
}
