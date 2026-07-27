import type { HistorialChartRow } from './historialOficial';

export type HistorialChartSerieKey =
  | 'retorno'
  | 'humedad'
  | 'ambiente'
  | 'suministro'
  | 'evaporador'
  | 'setTemperatura'
  | 'usda1'
  | 'usda2'
  | 'usda3'
  | 'usda4';

export type HistorialChartAxis = 'temp' | 'pct';

export interface HistorialChartSerie {
  key: HistorialChartSerieKey;
  label: string;
  color: string;
  unit: string;
  axis: HistorialChartAxis;
  /** Grosor de línea (SetPoint más visible). */
  strokeWidth?: number;
  /**
   * Si es false, la serie aparece en la leyenda (si hay datos) pero no se dibuja
   * hasta que el usuario la active. Por defecto true.
   */
  defaultVisible?: boolean;
  /** Mostrar etiquetas de valor sobre la línea (p. ej. Suministro / Retorno). */
  showValueLabels?: boolean;
}

/** Orden y colores al estilo Reefer Monitoring + USDA (carga 1–4). */
export const HISTORIAL_CHART_SERIES: HistorialChartSerie[] = [
  {
    key: 'retorno',
    label: 'Retorno',
    color: '#E53935',
    unit: '°C',
    axis: 'temp',
    showValueLabels: true,
  },
  {
    key: 'humedad',
    label: 'Humidity',
    color: '#AB47BC',
    unit: '%',
    axis: 'pct',
    defaultVisible: false,
  },
  {
    key: 'ambiente',
    label: 'Ambient',
    color: '#66BB6A',
    unit: '°C',
    axis: 'temp',
    defaultVisible: false,
  },

  {
    key: 'suministro',
    label: 'Suministro',
    color: '#1B5E20',
    unit: '°C',
    axis: 'temp',
    showValueLabels: true,
  },
  { key: 'evaporador', label: 'Evap', color: '#9E9E9E', unit: '°C', axis: 'temp' },
  {
    key: 'setTemperatura',
    label: 'SetPoint',
    color: '#FDD835',
    unit: '°C',
    axis: 'temp',
    strokeWidth: 2.5,
  },
  {
    key: 'usda1',
    label: 'USDA1',
    color: '#0288D1',
    unit: '°C',
    axis: 'temp',
    defaultVisible: false,
  },
  {
    key: 'usda2',
    label: 'USDA2',
    color: '#00897B',
    unit: '°C',
    axis: 'temp',
    defaultVisible: false,
  },
  {
    key: 'usda3',
    label: 'USDA3',
    color: '#F57C00',
    unit: '°C',
    axis: 'temp',
    defaultVisible: false,
  },
  {
    key: 'usda4',
    label: 'USDA4',
    color: '#5E35B1',
    unit: '°C',
    axis: 'temp',
    defaultVisible: false,
  },
];

export function serieVisiblePorDefecto(serie: HistorialChartSerie): boolean {
  return serie.defaultVisible !== false;
}

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
