/** Remitente Gmail (contraseña de aplicación). Persistido en localStorage del navegador. */
export interface SmtpConfig {
  user: string;
  appPassword: string;
  fromName: string;
}

/** Horas de aviso disponibles (2 … 24). */
export const UMBRALES_HORAS_DISPONIBLES = Array.from({ length: 23 }, (_, i) => i + 2);

export const DEFAULT_UMBRALES_HORAS: number[] = [...UMBRALES_HORAS_DISPONIBLES];

/** Equipo asignado a un grupo de correo. */
export interface GrupoCorreoDevice {
  rowKey: string;
  imei: string;
  codigo: string;
  /** ID/descripción en el correo (ej. ZGRU5295105). Si vacío → nombre en plataforma. */
  descripcionEquipo?: string;
  /** Horas en las que avisar; vacío → DEFAULT_UMBRALES_HORAS */
  umbralesHoras?: number[];
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
}
