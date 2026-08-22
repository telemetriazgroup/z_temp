import type { DatoOficialHistorial } from '../../types';
import {
  formatDateTimeInTz,
  parseTelemetryTimestampClient,
  resolveDisplayTimeZone,
} from '../../lib/telemetryTimezone';
import { celsiusToDisplay, type TemperaturaUnidad } from '../../lib/temperatureUnit';
import { getHistorialFieldDef } from './catalog';
import { sanitizeChartValue } from './sanitize';
import type { HistorialAxis, HistorialFieldDef } from './types';

export type HistorialChartRowDyn = {
  label: string;
  ts: number;
} & Record<string, number | null | string>;

export interface HistorialChartSerieDyn {
  key: string;
  label: string;
  color: string;
  unit: string;
  axis: HistorialAxis;
  strokeWidth?: number;
  showValueLabels?: boolean;
  defaultVisible?: boolean;
}

export function fieldDefToSerie(def: HistorialFieldDef): HistorialChartSerieDyn | null {
  if (!def.chartable || def.axis == null) return null;
  return {
    key: def.key,
    label: def.label,
    color: def.color ?? '#757575',
    unit: def.unit ?? '',
    axis: def.axis,
    strokeWidth: def.strokeWidth,
    showValueLabels: false,
    defaultVisible: true,
  };
}

export function seriesFromChartKeys(
  chartKeys: string[],
  opts?: {
    colorOverrides?: Record<string, string> | null;
    labelKeys?: string[] | null;
  }
): HistorialChartSerieDyn[] {
  const labelSet = new Set(opts?.labelKeys ?? []);
  const out: HistorialChartSerieDyn[] = [];
  for (const key of chartKeys) {
    const def = getHistorialFieldDef(key);
    if (!def) continue;
    const s = fieldDefToSerie(def);
    if (!s) continue;
    const override = opts?.colorOverrides?.[key];
    if (override) s.color = override;
    s.showValueLabels = labelSet.has(key);
    out.push(s);
  }
  return out;
}

/**
 * Construye filas de gráfica con keys = campo API.
 * Temperaturas convertidas a unidad de display si axis=temp.
 */
export function datosAGraficaDinamica(
  datos: DatoOficialHistorial[],
  chartKeys: string[],
  zonaHoraria?: string | null,
  unidad: TemperaturaUnidad = 'C'
): HistorialChartRowDyn[] {
  const display = resolveDisplayTimeZone(zonaHoraria);
  const sorted = [...datos].sort((a, b) => {
    const ta = parseTelemetryTimestampClient(
      String(a.created_at ?? a.fecha ?? '')
    );
    const tb = parseTelemetryTimestampClient(
      String(b.created_at ?? b.fecha ?? '')
    );
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });

  return sorted
    .map((row) => {
      const raw = row.created_at ?? row.fecha ?? null;
      if (raw == null || raw === '') return null;
      const ts = parseTelemetryTimestampClient(raw);
      if (Number.isNaN(ts)) return null;
      const point: HistorialChartRowDyn = {
        label: formatDateTimeInTz(raw, display.iana),
        ts,
      };
      for (const key of chartKeys) {
        const def = getHistorialFieldDef(key);
        let v = sanitizeChartValue(row, key);
        if (v != null && def?.axis === 'temp') {
          v = celsiusToDisplay(v, unidad);
        }
        point[key] = v;
      }
      return point;
    })
    .filter((r): r is HistorialChartRowDyn => r != null);
}

export function seriesConDatosDyn(
  data: HistorialChartRowDyn[],
  series: HistorialChartSerieDyn[]
): HistorialChartSerieDyn[] {
  return series.filter((s) =>
    data.some((row) => {
      const v = row[s.key];
      return typeof v === 'number' && !Number.isNaN(v);
    })
  );
}
