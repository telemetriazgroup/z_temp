/** Remitente Gmail (contraseña de aplicación). Persistido en localStorage del navegador. */
export interface SmtpConfig {
  user: string;
  appPassword: string;
  fromName: string;
}

/** Horas de aviso disponibles (2 … 24). */
export const UMBRALES_HORAS_DISPONIBLES = Array.from({ length: 23 }, (_, i) => i + 2);

export const DEFAULT_UMBRALES_HORAS: number[] = [...UMBRALES_HORAS_DISPONIBLES];

export type CorreoTipoEvento = 'operaciones' | 'mantenimiento';

export type CorreoIncidenteEstado = 'pendiente' | 'atendida';

/** Equipo asignado a un grupo de correo. */
export interface GrupoCorreoDevice {
  rowKey: string;
  imei: string;
  codigo: string;
  /** ID/descripción en el correo (ej. ZGRU5295105). Si vacío → nombre en plataforma. */
  descripcionEquipo?: string;
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
}

export interface CorreoIncidenteComentario {
  id: string;
  autor: string;
  texto: string;
  createdAt: string;
}

/** Incidente generado por cada correo de alerta enviado (gestión operaciones/mantenimiento). */
export interface CorreoIncidente {
  id: string;
  envioId: string;
  grupoId: string;
  grupoNombre: string;
  rowKey: string;
  imei: string;
  codigo: string;
  descripcionEquipo: string;
  nombrePlataforma: string;
  /** YYYY-MM-DD */
  diaCalendario: string;
  umbralHoras: number;
  horasFueraRango: number;
  tipoEvento: CorreoTipoEvento;
  estado: CorreoIncidenteEstado;
  subject: string;
  destinatarios: string[];
  enviadoAt: string;
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
