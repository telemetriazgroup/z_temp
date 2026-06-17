export type {
  SmtpConfig,
  DeviceEmailConfig,
  GrupoCorreo,
  GrupoCorreoDevice,
  CorreoEnvioLog,
  HourlyRangeBucket,
  AlertEngineResult,
  SendEmailPayload,
  SendEmailResult,
} from './types';
export { DEFAULT_UMBRALES_HORAS, UMBRALES_HORAS_DISPONIBLES } from './types';
export {
  readSmtpConfig,
  persistSmtpConfig,
  clearSmtpConfig,
} from './smtpConfigRepository';
export {
  getDeviceEmailConfigs,
  getDeviceEmailConfig,
  upsertDeviceEmailConfig,
} from './deviceEmailRepository';
export {
  generateGrupoCorreoId,
  getGruposCorreo,
  getGrupoCorreoById,
  getGruposCorreoForDevice,
  upsertGrupoCorreo,
  deleteGrupoCorreo,
  parseEmailList,
  normalizeUmbrales,
} from './grupoCorreoRepository';
export {
  recordRangePoll,
  getHourlyBuckets,
  consecutiveHoursOutOfRange,
  getRecentPolls,
  hourKeyOf,
} from './rangeHistoryRepository';
export {
  getEpisode,
  clearEpisode,
  episodeHoursElapsed,
} from './episodeRepository';
export { getCorreoEnvioLogs, getEnvioLogsForDevice } from './envioLogRepository';
export {
  buildFueraDeRangoEmail,
  buildFueraDeRangoEmailLegacy,
} from './buildAlertEmail';
export { sendEmailViaApi } from './emailApi';
export {
  ALERT_POLL_INTERVAL_MS,
  runAlertEngine,
  deviceRowKey,
  resolveDeviceLabels,
} from './alertEngine';
export { CorreoAlertRunner } from './CorreoAlertRunner';
