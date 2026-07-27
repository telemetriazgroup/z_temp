import { parseTelemetryTimestamp } from '../timezone.js';
import { timestampRegistroHistorial } from '../historicalTelemetry.js';
import { NUMERIC_FIELDS, MS_HORA } from './hourly.js';

/**
 * PLI + LOCF: puntos cada hora en punto entre anclas (strict).
 */
export function interpolatePliLocf(anclaAntes, anclaDespues) {
  const t0 = timestampRegistroHistorial(anclaAntes);
  const t1 = timestampRegistroHistorial(anclaDespues);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) return [];

  const points = [];
  // Primera hora en punto estrictamente después de t0
  let cursor = new Date(t0);
  cursor.setUTCMinutes(0, 0, 0);
  cursor = new Date(cursor.getTime() + MS_HORA);

  while (cursor.getTime() < t1) {
    const t = cursor.getTime();
    const ratio = (t - t0) / (t1 - t0);
    const payload = {
      power_state: anclaAntes.power_state ?? null,
    };
    for (const f of NUMERIC_FIELDS) {
      const a = anclaAntes[f];
      const b = anclaDespues[f];
      if (a == null || Number.isNaN(Number(a)) || b == null || Number.isNaN(Number(b))) {
        payload[f] = null;
      } else {
        payload[f] =
          Math.round((Number(a) + (Number(b) - Number(a)) * ratio) * 10) / 10;
      }
    }
    points.push({
      ts: cursor.toISOString(),
      payload,
      metodo: 'pli_locf_horaria',
      anclaAntesTs: new Date(t0).toISOString(),
      anclaDespuesTs: new Date(t1).toISOString(),
    });
    cursor = new Date(t + MS_HORA);
  }
  return points;
}

export function findAnchorRows(datos, sinceIso, untilIso) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({ ts: timestampRegistroHistorial(row), row }))
    .filter((x) => !Number.isNaN(x.ts))
    .sort((a, b) => a.ts - b.ts);

  const since = parseTelemetryTimestamp(sinceIso);
  const until = parseTelemetryTimestamp(untilIso);
  let before = null;
  let after = null;
  for (const x of sorted) {
    if (x.ts <= since) before = x.row;
    if (x.ts >= until) {
      after = x.row;
      break;
    }
  }
  return { before, after };
}
