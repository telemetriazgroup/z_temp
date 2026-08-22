/** Tipos de vista dinámica de historial (gráfica + tabla). */

export type HistorialAxis = 'temp' | 'pct' | 'high';

export type HistorialFieldTransform =
  | 'battery_div10'
  | 'power_state_override'
  | 'power_kwh_min';

/** Clave de campo = nombre en telemetría oficial. */
export type HistorialFieldKey = string;

export interface HistorialFieldDef {
  key: HistorialFieldKey;
  label: string;
  chartable: boolean;
  tableable: boolean;
  /** Eje si chartable; null = solo tabla. */
  axis: HistorialAxis | null;
  min?: number;
  max?: number;
  unit?: string;
  transform?: HistorialFieldTransform;
  /** Color sugerido en gráfica. */
  color?: string;
  strokeWidth?: number;
  showValueLabels?: boolean;
  conTendencia?: boolean;
}

export type HistorialPresetId = 'REEFER' | 'TUNEL' | 'MADURADOR' | 'CUSTOM';

export interface HistorialVistaPrefs {
  preset: HistorialPresetId;
  /** Series activas en gráfica (subset chartable). */
  chartKeys: string[];
  /** Columnas de tabla (sin fecha; fecha siempre va primero). */
  tableKeys: string[];
  /** Series con etiquetas de valor en la gráfica. */
  labelKeys?: string[];
  /** Colores personalizados por key de serie (override del catálogo). */
  chartColors?: Record<string, string>;
  updatedAt?: string;
}

export interface HistorialVistaPrefsStored extends HistorialVistaPrefs {
  username: string;
  imei: string;
  codigo?: string | null;
}
