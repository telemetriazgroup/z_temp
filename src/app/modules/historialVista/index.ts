export type {
  HistorialAxis,
  HistorialFieldDef,
  HistorialFieldKey,
  HistorialFieldTransform,
  HistorialPresetId,
  HistorialVistaPrefs,
  HistorialVistaPrefsStored,
} from './types';
export {
  HISTORIAL_FIELD_CATALOG,
  getHistorialFieldDef,
  chartableFields,
  tableableFields,
} from './catalog';
export {
  sanitizeChartValue,
  sanitizeTableValue,
  formatSanitizedTableCell,
  resolvePowerState,
  rawFieldValue,
} from './sanitize';
export {
  HISTORIAL_PRESETS,
  PRESET_ORDER,
  prefsFromPreset,
  defaultHistorialVistaPrefs,
} from './presets';
export {
  normalizeVistaPrefs,
  parseChartColors,
  parseLabelKeys,
  readVistaPrefsLocal,
  writeVistaPrefsLocal,
} from './prefsLocal';
export {
  fetchHistorialVistaPrefs,
  saveHistorialVistaPrefs,
} from './historialVistaApi';
export {
  datosAGraficaDinamica,
  seriesFromChartKeys,
  seriesConDatosDyn,
  fieldDefToSerie,
  type HistorialChartRowDyn,
  type HistorialChartSerieDyn,
} from './chartBuild';
export {
  resolveTableColumnKeys,
  tableColumnHeader,
  fieldDefForTableKey,
  fechaRegistroRaw,
  celdaVistaHistorial,
} from './tableBuild';
