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
  CorreoTipoEvento,
  CorreoIncidenteEstado,
  CorreoIncidente,
  CorreoIncidenteComentario,
  CorreoServerStatus,
  SmtpConfigServerView,
  SmtpConfigSaveInput,
  CorreoCicloAnalisis,
  CicloEvaluacionDispositivo,
  CicloEvaluacionEstado,
  CicloResumen,
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
export { sendEmailViaApi } from './correoServerApi';
export {
  fetchCorreoStatus,
  fetchServerSmtp,
  saveServerSmtp,
  fetchServerGrupos,
  saveServerGrupo,
  deleteServerGrupo,
  fetchServerEnvios,
  fetchServerIncidentes,
  comentarIncidente,
  atenderIncidente,
  deleteIncidente,
  runServerAlertCycle,
  migrateLocalCorreoToServer,
  fetchServerCiclos,
  fetchServerCiclo,
  clearCorreoHistorial,
  syncDeviceNamesToServer,
  fetchDeviceNamesFromServer,
  saveDeviceNameOnServer,
  fetchDeviceNameHistoryFromServer,
} from './correoServerApi';
export {
  userHasCorreoIncidentAccess,
  userMayAccessCorreoDevice,
  rowKeysCorreoActivosForUser,
  imeisCorreoForUser,
  incidenteVisibleParaUser,
  diaRelativoLabel,
  tipoEventoLabel,
} from './incidentAccess';
export { ALERT_POLL_INTERVAL_MS, deviceRowKey, resolveDeviceLabels } from './alertEngine';
