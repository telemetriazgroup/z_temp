import { timestampRegistroHistorial } from '../historicalTelemetry.js';
import { parseTelemetryTimestamp } from '../timezone.js';

const MS_HORA = 60 * 60 * 1000;

const NUMERIC_FIELDS = [
  'set_point',
  'return_air',
  'temp_supply_1',
  'evaporation_coil',
  'ambient_air',
  'relative_humidity',
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'cargo_4_temp',
];

function hourBucketStart(ts) {
  const d = new Date(ts);
  // Aproxima bucket por hora UTC del instante; suficiente para serie ~1h
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

/**
 * Serie ~1 muestra/hora en [since, until]: media de campos numéricos;
 * power_state mayoritario (empate → último).
 */
export function downsampleHourly(datos, sinceIso, untilIso, openEnd = Date.now()) {
  const from = parseTelemetryTimestamp(sinceIso);
  const to =
    untilIso == null ? openEnd : parseTelemetryTimestamp(untilIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return [];

  const buckets = new Map();

  for (const row of datos ?? []) {
    const ts = timestampRegistroHistorial(row);
    if (Number.isNaN(ts) || ts < from || ts > to) continue;
    const key = hourBucketStart(ts);
    if (!buckets.has(key)) {
      buckets.set(key, { rows: [], last: row, lastTs: ts });
    }
    const b = buckets.get(key);
    b.rows.push(row);
    if (ts >= b.lastTs) {
      b.last = row;
      b.lastTs = ts;
    }
  }

  const out = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, b]) => {
      const point = {
        ts: new Date(ts).toISOString(),
        fuente: 'oficial',
      };
      for (const f of NUMERIC_FIELDS) {
        const vals = b.rows
          .map((r) => r[f])
          .filter((v) => v != null && !Number.isNaN(Number(v)))
          .map(Number);
        point[f] =
          vals.length === 0
            ? null
            : Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
      }
      const powers = b.rows
        .map((r) => r.power_state)
        .filter((v) => v === 0 || v === 1);
      if (powers.length === 0) {
        point.power_state = b.last.power_state ?? null;
      } else {
        const on = powers.filter((p) => p === 1).length;
        const off = powers.length - on;
        point.power_state = on === off ? b.last.power_state ?? powers.at(-1) : on > off ? 1 : 0;
      }
      return point;
    });

  return out;
}

/** Une serie oficial con puntos interpolados (marca fuente). */
export function mergeSerieConInterpolados(oficial, interpolados) {
  const map = new Map();
  for (const p of oficial) {
    map.set(p.ts, { ...p, fuente: 'oficial' });
  }
  for (const p of interpolados ?? []) {
    const ts = p.ts instanceof Date ? p.ts.toISOString() : p.ts;
    map.set(ts, {
      ts,
      fuente: 'interpolado_admin',
      ...(p.payload ?? p),
    });
  }
  return [...map.values()].sort(
    (a, b) => parseTelemetryTimestamp(a.ts) - parseTelemetryTimestamp(b.ts)
  );
}

export { NUMERIC_FIELDS, MS_HORA };
