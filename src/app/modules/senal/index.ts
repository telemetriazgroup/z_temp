export type {
  SenalUbicacion,
  SenalTelemetry,
  SenalEpisode,
  SenalEvento,
  SenalEventoTipo,
  SenalDeviceBehavior,
  SenalDeviceHistory,
  SenalBehaviorReport,
  SenalJob,
} from './types';
export {
  fetchSenalBehavior,
  fetchSenalJob,
  startSenalJob,
  pauseSenalJob,
  resumeSenalJob,
  fetchSenalDeviceHistory,
  saveSenalUbicacion,
  createSenalEvento,
  deleteSenalEvento,
} from './senalApi';
