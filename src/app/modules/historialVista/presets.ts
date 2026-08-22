import type { HistorialPresetId, HistorialVistaPrefs } from './types';

const REEFER_CHART = [
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'set_point',
] as const;

const REEFER_TABLE = [
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'set_point',
  'compress_coil_1',
  'ambient_air',
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'cargo_4_temp',
  'line_voltage',
  'line_frequency',
  'consumption_ph_1',
  'consumption_ph_2',
  'consumption_ph_3',
  'relative_humidity',
] as const;

const TUNEL_CHART = [
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'return_air',
  'set_point',
] as const;

const TUNEL_TABLE = [
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'set_point',
  'compress_coil_1',
  'ambient_air',
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'cargo_4_temp',
  'line_voltage',
  'line_frequency',
  'consumption_ph_1',
  'consumption_ph_2',
  'consumption_ph_3',
  'relative_humidity',
] as const;

const MADURADOR_CHART = [
  'ethylene',
  'co2_reading',
  'relative_humidity',
  'return_air',
  'set_point',
] as const;

const MADURADOR_TABLE = [
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'set_point',
  'compress_coil_1',
  'ambient_air',
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'cargo_4_temp',
  'line_voltage',
  'line_frequency',
  'consumption_ph_1',
  'consumption_ph_2',
  'consumption_ph_3',
  'controlling_mode',
  'ethylene',
  'co2_reading',
  'avl',
] as const;

export const HISTORIAL_PRESETS: Record<
  Exclude<HistorialPresetId, 'CUSTOM'>,
  {
    label: string;
    chartKeys: string[];
    tableKeys: string[];
    /** Etiquetas de valor ON por defecto. */
    labelKeys: string[];
  }
> = {
  REEFER: {
    label: 'Reefer',
    chartKeys: [...REEFER_CHART],
    tableKeys: [...REEFER_TABLE],
    labelKeys: ['return_air'],
  },
  TUNEL: {
    label: 'Túnel',
    chartKeys: [...TUNEL_CHART],
    tableKeys: [...TUNEL_TABLE],
    labelKeys: ['cargo_1_temp', 'cargo_2_temp'],
  },
  MADURADOR: {
    label: 'Madurador',
    chartKeys: [...MADURADOR_CHART],
    tableKeys: [...MADURADOR_TABLE],
    labelKeys: ['ethylene', 'co2_reading'],
  },
};

export function prefsFromPreset(
  preset: Exclude<HistorialPresetId, 'CUSTOM'>
): HistorialVistaPrefs {
  const p = HISTORIAL_PRESETS[preset];
  return {
    preset,
    chartKeys: [...p.chartKeys],
    tableKeys: [...p.tableKeys],
    labelKeys: [...p.labelKeys],
  };
}

export function defaultHistorialVistaPrefs(): HistorialVistaPrefs {
  return prefsFromPreset('REEFER');
}

export const PRESET_ORDER: Exclude<HistorialPresetId, 'CUSTOM'>[] = [
  'REEFER',
  'TUNEL',
  'MADURADOR',
];
