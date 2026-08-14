/** Remitente Gmail (contraseña de aplicación). Persistido en localStorage del navegador. */
export interface SmtpConfig {
  user: string;
  appPassword: string;
  fromName: string;
}

/** Horas de aviso disponibles (2 … 24). Umbral 0.5 = 30 min (alerta temprana). */
export const UMBRAL_ALERTA_30_MIN = 0.5;

export const UMBRALES_HORAS_DISPONIBLES = Array.from({ length: 23 }, (_, i) => i + 2);

export const DEFAULT_UMBRALES_HORAS: number[] = [...UMBRALES_HORAS_DISPONIBLES];

export function formatUmbralAlerta(h: number): string {
  if (h === UMBRAL_ALERTA_30_MIN) return '30 min';
  return `${h} h`;
}

export type DeviceAlertConfigMode = 'standard' | 'custom';

/** Configuración de alerta por equipo (override del estándar del grupo). */
export interface DeviceAlertConfig {
  rowKey: string;
  mode: DeviceAlertConfigMode;
  umbralesHoras?: number[];
  referenciaManual?: string;
  useReferenciaManual?: boolean;
  /** Incluir aviso a la 1.ª hora fuera de rango (además de umbrales del grupo/custom). */
  alerta1Hora?: boolean;
  /** Incluir aviso a los 30 minutos fuera de rango / apagado. */
  alerta30Minutos?: boolean;
  /** Usar márgenes °C personalizados en lugar de ±10 % del setpoint. */
  useRangoPersonalizado?: boolean;
  /** Grados bajo el setpoint considerados EN RANGO. */
  margenInferior?: number;
  /** Grados sobre el setpoint considerados EN RANGO. */
  margenSuperior?: number;
  updatedAt?: string;
}

/** Episodio activo en servidor (referencia fuera de rango). */
export interface DeviceAlertEpisode {
  since: string;
  sentUmbrales: number[];
  kind?: 'fuera_rango' | 'apagado';
  referenceLocked?: boolean;
  referenciaManual?: boolean;
  historialConsultadoAt?: string;
  establishedAt?: string;
  fromHistorial?: boolean;
}

export interface DeviceAlertStateEntry {
  rowKey: string;
  imei: string;
  codigo: string;
  descripcionEquipo?: string;
  nombrePlataforma?: string;
  grupoNombre: string;
  config: DeviceAlertConfig | null;
  episode: DeviceAlertEpisode | null;
  lastRecovered?: {
    since: string;
    endedAt: string;
    durationHours: number;
  } | null;
}

export interface DeviceAlertStateView {
  entries: DeviceAlertStateEntry[];
  updatedAt: string;
}

export interface ReferenciaUpdateResult {
  rowKey: string;
  episode: DeviceAlertEpisode | null;
  since?: string | null;
  recovered?: {
    since: string;
    endedAt: string;
    durationHours: number;
    kind?: string;
    sentUmbrales?: number[];
  } | null;
  consultaHistorial?: boolean;
  criterio: string;
}

export interface AlertEventoIntervalo {
  since: string;
  until: string | null;
  durationHours: number;
}

export interface DeviceEventosView {
  rowKey: string;
  imei: string;
  codigo: string;
  episode: DeviceAlertEpisode | null;
  lastRecovered?: DeviceAlertStateEntry['lastRecovered'];
  intervalosFueraRango: AlertEventoIntervalo[];
  intervalosApagado: AlertEventoIntervalo[];
  incidentes: CorreoIncidente[];
  historialPuntos: number;
  consultadoAt: string;
}


export type CorreoIncidenteEstado = 'pendiente' | 'atendida' | 'cerrado';

/** Equipo asignado a un grupo de correo. */
export interface GrupoCorreoDevice {
  rowKey: string;
  imei: string;
  codigo: string;
  /** ID/descripción en el correo (ej. ZGRU5295105). Si vacío → nombre en plataforma. */
  descripcionEquipo?: string;
  /** Nombre reconocido por el cliente (columna Nombre del listado). */
  nombrePlataforma?: string;
  /** Horas en las que avisar; vacío → DEFAULT_UMBRALES_HORAS */
  umbralesHoras?: number[];
  /** Clasificación del evento en incidentes y correo. */
  tipoEvento?: CorreoTipoEvento;
  enabled: boolean;
}

/** Grupo de destinatarios para alertas de uno o más dispositivos. */
export interface GrupoCorreo {
  id: string;
  nombre: string;
  cliente: string;
  emails: string[];
  devices: GrupoCorreoDevice[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Lectura puntual para historial (cada ~2 min). */
export interface RangePollSnapshot {
  rowKey: string;
  enRango: boolean | null;
  recordedAt: string;
}

/** Resumen por hora (últimas 12 h). */
export interface HourlyRangeBucket {
  rowKey: string;
  /** Clave hora local YYYY-MM-DDTHH */
  hourKey: string;
  enRango: boolean | null;
  sampleCount: number;
  updatedAt: string;
}

/** Episodio continuo fuera de rango (se reinicia al volver EN RANGO). */
export interface DeviceRangeEpisode {
  rowKey: string;
  startedAt: string;
  /** Mayor umbral (horas) ya notificado en este episodio. */
  lastSentUmbral: number;
}

/** Registro de envío de correo de alerta. */
export interface CorreoEnvioLog {
  id: string;
  grupoId: string;
  grupoNombre: string;
  rowKey: string;
  imei: string;
  descripcionEquipo: string;
  nombrePlataforma: string;
  umbralHoras: number;
  horasFueraRango: number;
  destinatarios: string[];
  subject: string;
  sentAt: string;
  messageId?: string;
  success: boolean;
  error?: string;
}

/** @deprecated Usar GrupoCorreo */
export interface DeviceEmailConfig {
  rowKey: string;
  imei: string;
  codigo: string;
  emails: string[];
  enabled: boolean;
}

export interface SendEmailPayload {
  smtp: SmtpConfig;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface AlertEngineResult {
  checkedAt: string;
  devicesChecked: number;
  emailsSent: number;
  errors: string[];
  skipped?: string;
  id?: string;
  trigger?: 'automatic' | 'manual';
  startedAt?: string;
  finishedAt?: string;
  criterio?: string;
  resumen?: CicloResumen;
}

export type CicloEvaluacionEstado =
  | 'normal'
  | 'fuera_rango_sin_envio'
  | 'correo_enviado'
  | 'equipo_apagado'
  | 'correo_apagado_enviado'
  | 'error_envio'
  | 'sin_telemetria'
  | 'sin_dato_rango'
  | 'equipo_off'
  | 'grupo_inactivo'
  | 'grupo_sin_correos';

export interface CicloResumen {
  normal: number;
  fueraRangoSinEnvio: number;
  correoEnviado: number;
  sinTelemetria: number;
  sinDatoRango: number;
  equipoOff: number;
  errores: number;
}

export interface CicloEvaluacionDispositivo {
  rowKey: string;
  imei: string;
  codigo: string;
  grupoId: string;
  grupoNombre: string;
  descripcionEquipo: string;
  assignmentEnabled?: boolean;
  /** estándar (grupo) o personalizada (deviceAlertConfig). */
  configAlerta?: 'estándar' | 'personalizada';
  estado: CicloEvaluacionEstado;
  accion: 'ninguna' | 'envio' | 'error';
  criterio: string;
  enRango?: boolean | null;
  diaCalendario?: string;
  horasFueraHoy?: number;
  /** Inicio del episodio fuera de rango (referencia persistida o desde historial 12 h). */
  referenciaDesde?: string | null;
  /** true si en este ciclo se consultó buscar_datos_oficiales para fijar referencia. */
  consultaHistorial?: boolean;
  recuperadoAt?: string | null;
  umbralesConfigurados?: number[];
  umbralesEnviadosHoy?: number[];
  umbralesPendientes?: number[];
  proximoUmbralHoras?: number | null;
  umbralDisparado?: number;
  tipoEvento?: CorreoTipoEvento;
  envioId?: string;
  incidenteId?: string;
  telemetria?: {
    setPoint: number | null;
    tempSupply: number | null;
    returnAir: number | null;
    ultimaActualizacion: string | null;
    estadoConexion: string | null;
  };
}

export interface CorreoCicloAnalisis {
  id: string;
  trigger: 'automatic' | 'manual';
  startedAt: string;
  finishedAt?: string;
  checkedAt: string;
  devicesChecked: number;
  emailsSent: number;
  errors: string[];
  skipped?: string;
  criterio?: string;
  resumen?: CicloResumen;
  evaluaciones: CicloEvaluacionDispositivo[];
}

export interface CorreoIncidenteComentario {
  id: string;
  autor: string;
  texto: string;
  createdAt: string;
}

/** Incidente generado por correo enviado o episodio cerrado (gestión operaciones/mantenimiento). */
export interface CorreoIncidente {
  id: string;
  tipo?: 'correo_enviado' | 'episodio_cerrado';
  alertKind?: 'fuera_rango' | 'apagado';
  envioId?: string;
  grupoId?: string;
  grupoNombre?: string;
  rowKey: string;
  imei: string;
  codigo: string;
  descripcionEquipo: string;
  nombrePlataforma: string;
  /** YYYY-MM-DD */
  diaCalendario?: string;
  umbralHoras?: number;
  horasFueraRango?: number;
  tipoEvento?: CorreoTipoEvento;
  estado: CorreoIncidenteEstado;
  subject?: string;
  destinatarios?: string[];
  enviadoAt: string;
  since?: string;
  endedAt?: string;
  durationHours?: number;
  umbralesEnviados?: number[];
  referenciaDesde?: string;
  archivado?: boolean;
  archivadoAt?: string;
  archivadoPor?: string;
  comentarios: CorreoIncidenteComentario[];
  atendidaAt?: string;
  atendidaPor?: string;
}

export interface CorreoServerStatus {
  smtpConfigured: boolean;
  smtpUpdatedAt?: string | null;
  gruposActivos: number;
  lastRun: AlertEngineResult | null;
  incidentesPendientes: number;
}

/** KPI live / promedio del dashboard Inicio. */
export interface DashboardFleetCounts {
  total: number;
  online: number;
  wait: number;
  offline: number;
  power_on?: number;
  power_off?: number;
  en_defrost?: number;
  en_rango: number;
  fuera_rango: number;
  apagado?: number;
  indeterminado?: number;
  pct_online: number | null;
  pct_en_rango: number | null;
  by_codigo?: Record<string, unknown>;
  captured_at?: string;
}

export interface DashboardPeriodAverage {
  samples: number;
  online: number;
  wait: number;
  offline: number;
  en_rango: number;
  fuera_rango: number;
  pct_online: number;
  pct_en_rango: number;
  total: number;
}

export interface DashboardDayPoint {
  day: string;
  online: number;
  wait: number;
  offline: number;
  en_rango: number;
  fuera_rango: number;
  pct_online: number;
  pct_en_rango: number;
  samples: number;
}

export interface DashboardWeekStatus {
  label: string;
  detalle: string;
  tendencia: 'up' | 'down' | 'stable' | 'neutral';
  pct_online: number;
  pct_en_rango: number;
  delta_pct_online: number | null;
  delta_pct_en_rango: number | null;
}

export interface DashboardUrgentEnvio {
  id: string;
  subject: string;
  imei: string;
  descripcionEquipo: string;
  umbralHoras: number;
  sentAt: string;
  success: boolean;
  grupoNombre: string;
}

export interface DashboardUrgentAlarma {
  id: string;
  imei: string;
  codigo: string;
  descripcionEquipo: string;
  alertKind: string | null;
  umbralHoras: number | null;
  horasFueraRango: number | null;
  enviadoAt: string;
  estado: string;
  subject: string | null;
}

export interface DashboardUrgentEquipo {
  imei: string;
  codigo: string | null;
  rowKey: string;
  nombre: string;
  power_state_texto?: string | null;
  en_rango?: boolean | null;
  en_defrost?: boolean | null;
  ultima_actualizacion?: string | null;
}

export interface DashboardOverview {
  live: DashboardFleetCounts;
  averages: {
    dia: DashboardPeriodAverage;
    semana: DashboardPeriodAverage;
    mes: DashboardPeriodAverage;
  };
  weekSeries: DashboardDayPoint[];
  weekStatus: DashboardWeekStatus;
  latestSnapshotAt: string | null;
  telemetryError?: string | null;
  urgent: {
    envios: DashboardUrgentEnvio[];
    alarmas: DashboardUrgentAlarma[];
    conectados: DashboardUrgentEquipo[];
    fueraRango: DashboardUrgentEquipo[];
  };
  links: {
    current: DashboardLinkStatus[];
    liveCheck: Array<{
      codigo: string;
      url: string;
      ok: boolean;
      latencyMs?: number | null;
      error?: string | null;
      deviceCount?: number;
    }>;
    probes3h: DashboardLinkProbe[];
    alert: {
      active: boolean;
      message: string | null;
      codigos: string[];
    };
  };
  devices: {
    pendingReview: DashboardKnownDevice[];
    /** Equipos con más tiempo fuera de línea (offline/wait), máx. 5. */
    longestOffline: DashboardOfflineEquipo[];
    /** @deprecated alias de longestOffline */
    recentlyRegistered: DashboardOfflineEquipo[];
  };
  /**
   * Flota visible completa (misma carga del overview).
   * El cliente la hidrata en DispositivosFleetContext para no reconsultar en Listado.
   */
  fleet?: {
    dispositivos: import('../../types').DispositivoUltimoEstado[];
    zona_horaria?: string;
    captured_at?: string;
  };
  users: {
    recentLogins: DashboardUserLogin[];
  };
}

export interface DashboardOfflineEquipo {
  imei: string;
  codigo: string | null;
  rowKey: string;
  nombre: string;
  estado_conexion: string;
  minutos_desde_ultimo_dato: number | null;
  ultima_actualizacion: string | null;
}

export interface DashboardLinkStatus {
  codigo: string;
  url: string | null;
  ok: boolean;
  checked_at: string;
  latency_ms: number | null;
  error_message: string | null;
  device_count: number;
  online_count: number;
  wait_count: number;
  offline_count: number;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_success: {
    devices?: Array<Record<string, unknown>>;
    counts?: Record<string, number>;
  };
}

export interface DashboardLinkProbe {
  codigo: string;
  checked_at: string;
  ok: boolean;
  latency_ms: number | null;
  error_message: string | null;
  device_count: number;
  online_count: number;
  wait_count: number;
  offline_count: number;
}

export interface DashboardKnownDevice {
  rowKey: string;
  imei: string;
  codigo: string | null;
  first_seen_at: string;
  last_seen_at: string;
  first_estado_conexion?: string | null;
  last_estado_conexion?: string | null;
  last_power_state?: string | null;
  review_status: 'pendiente' | 'revisado' | 'ignorado' | string;
  nombre?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface DashboardUserLogin {
  id: string;
  userId: string | null;
  username: string;
  role: string | null;
  superUser: boolean;
  logged_in_at: string;
}

/** Vista pública del SMTP guardado en servidor (sin contraseña). */
export interface SmtpConfigServerView {
  user: string;
  fromName: string;
  hasPassword: boolean;
  updatedAt: string | null;
}

export type SmtpConfigSaveInput = {
  user: string;
  fromName: string;
  /** Omitir o vacío = mantener clave ya guardada en servidor. */
  appPassword?: string;
};
