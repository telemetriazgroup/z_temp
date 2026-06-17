import type { DispositivoOrigenCodigo } from '../../types';

/** Entrada del catálogo de alarmas del controlador (p. ej. MP4000). */
export interface AlarmCatalogEntry {
  id: string;
  code: number;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  correctiveActionEs: string;
  correctiveActionEn: string;
  model: string;
  archived: boolean;
}

/** Evento de alarma detectado en un dispositivo vía telemetría (`numero_alarma`). */
export interface DeviceAlarmEvent {
  id: string;
  imei: string;
  codigo: DispositivoOrigenCodigo | null;
  alarmCode: number;
  /** Referencia al catálogo (`AlarmCatalogEntry.id`). */
  catalogId: string | null;
  detectedAt: string;
  clearedAt: string | null;
  atendida: boolean;
  reportadaEmail: boolean;
}

export interface AlarmCatalogSeedFile {
  meta?: {
    model?: string;
    count?: number;
  };
  alarms: Array<Omit<AlarmCatalogEntry, 'id'>>;
}
