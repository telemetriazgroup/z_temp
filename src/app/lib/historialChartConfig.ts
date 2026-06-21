import type { HistorialChartRow } from './historialOficial';

export type HistorialChartSerieKey =
  | 'retorno'
  | 'humedad'
  | 'ambiente'
  | 'suministro'
  | 'evaporador'
  | 'setTemperatura';

export type HistorialChartAxis = 'temp' | 'pct';

export interface HistorialChartSerie {
  key: HistorialChartSerieKey;
  label: string;
  color: string;
  unit: string;
  axis: HistorialChartAxis;
  /** Grosor de línea (SetPoint más visible). */
  strokeWidth?: number;
}

/** Orden y colores al estilo Reefer Monitoring (Return, Humidity, Ambient, Supply, Evap, SetPoint). */
export const HISTORIAL_CHART_SERIES: HistorialChartSerie[] = [
  { key: 'retorno', label: 'Return', color: '#E53935', unit: '°C', axis: 'temp' },
  { key: 'humedad', label: 'Humidity', color: '#AB47BC', unit: '%', axis: 'pct' },
  { key: 'ambiente', label: 'Ambient', color: '#66BB6A', unit: '°C', axis: 'temp' },
  { key: 'suministro', label: 'Supply', color: '#1B5E20', unit: '°C', axis: 'temp' },
  { key: 'evaporador', label: 'Evap', color: '#9E9E9E', unit: '°C', axis: 'temp' },
  {
    key: 'setTemperatura',
    label: 'SetPoint',
    color: '#FDD835',
    unit: '°C',
    axis: 'temp',
    strokeWidth: 2.5,
  },
];

export function seriesConDatos(
  data: HistorialChartRow[],
  series: HistorialChartSerie[] = HISTORIAL_CHART_SERIES
): HistorialChartSerie[] {
  return series.filter((s) =>
    data.some((row) => {
      const v = row[s.key];
      return v != null && !Number.isNaN(v as number);
    })
  );
}

export function valorSerieFormateado(value: unknown, unit: string): string {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return unit === '°C' ? n.toFixed(1) : n.toFixed(0);
}
