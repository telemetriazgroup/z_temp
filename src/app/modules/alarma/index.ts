export type { AlarmCatalogEntry, DeviceAlarmEvent, AlarmCatalogSeedFile } from './types';
export type { AlarmaSlotLectura, AlarmaSlotResuelta } from './alarmSlots';
export { buildBootstrapAlarmCatalog, catalogIdFor } from './bootstrapAlarms';
export {
  ensureAlarmCatalog,
  getAlarmCatalogEntries,
  getAlarmCatalogById,
  getAlarmCatalogByCode,
  addAlarmCatalogEntry,
  updateAlarmCatalogEntry,
  deleteAlarmCatalogEntry,
} from './alarmCatalogRepository';
export {
  generateDeviceAlarmId,
  getDeviceAlarmEvents,
  getActiveDeviceAlarmEvents,
  getDeviceAlarmEventsByImei,
  addDeviceAlarmEvent,
  updateDeviceAlarmEvent,
  deleteDeviceAlarmEvent,
  isActiveAlarmCode,
} from './deviceAlarmRepository';
export { syncDeviceAlarmsFromTelemetry } from './syncDeviceAlarms';
export {
  resolveAlarmCatalogForCode,
  resolveAlarmCatalogForDevice,
  resolveAlarmTitle,
  formatAlarmCodeLabel,
} from './alarmResolver';
export {
  ALARMA_SLOT_FIELD_NAMES,
  extractActiveAlarmCodes,
  dispositivoTieneAlarmasActivas,
  resolveAlarmSlotsFromUltimoDato,
  resolveAlarmSlotsFromDevice,
} from './alarmSlots';
