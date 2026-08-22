export type SenalUbicacion = {
  imei: string;
  codigo?: string | null;
  pais?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  zona?: string | null;
  observaciones?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  updated_at?: string;
  updated_by?: string | null;
};

export type SenalTelemetry = {
  capturedAt?: string | null;
  set_point?: number | null;
  temp_supply_1?: number | null;
  return_air?: number | null;
  cargo_1_temp?: number | null;
  cargo_2_temp?: number | null;
  cargo_3_temp?: number | null;
  power_state?: number | string | null;
  power_state_texto?: 'on' | 'off' | null;
};

export type SenalEpisode = {
  id?: number | null;
  lazoId?: number | string | null;
  episodioIds?: Array<number | string>;
  tipo: 'wait' | 'offline';
  startedAt: string;
  endedAt: string;
  durationMin: number;
  recovered: boolean;
  open?: boolean;
  startHour: number;
  endHour: number;
  datosInicio?: SenalTelemetry | null;
  datosFin?: SenalTelemetry | null;
};

export type SenalEventoTipo =
  | 'corte_energia'
  | 'sin_cobertura'
  | 'mantenimiento'
  | 'traslado'
  | 'puerto'
  | 'clima'
  | 'otro';

export type SenalEvento = {
  id: number;
  imei: string;
  episodioId?: number | null;
  tipo: SenalEventoTipo | string;
  titulo?: string | null;
  nota?: string | null;
  occurredAt: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
};

export type SenalDeviceBehavior = {
  imei: string;
  codigo: string | null;
  nombre?: string | null;
  lastDisconnectAt?: string | null;
  rowKey: string;
  samples: number;
  lastEstado: string;
  lastCapturedAt: string | null;
  waitEpisodes: number;
  waitRecovered: number;
  waitAvgMin: number;
  waitTotalMin: number;
  offlineEpisodes: number;
  offlineRecovered: number;
  offlineAvgMin: number;
  offlineTotalMin: number;
  episodes: SenalEpisode[];
  neverDisconnected?: boolean;
  ubicacion: SenalUbicacion | null;
};

export type SenalJob = {
  status: 'idle' | 'running' | 'paused' | 'done' | 'error' | string;
  mode?: string;
  processed: number;
  devicesSeen: number;
  lastImei?: string | null;
  lastNombre?: string | null;
  lastCapturedAt?: string | null;
  error?: string | null;
  startedAt?: string | null;
  startedBy?: string | null;
  updatedAt?: string | null;
};

export type SenalDeviceHistory = {
  imei: string;
  codigo: string | null;
  nombre: string | null;
  lastEstado: string | null;
  lastCapturedAt: string | null;
  lastDisconnectAt: string | null;
  ubicacion: SenalUbicacion | null;
  episodes: SenalEpisode[];
  eventos: SenalEvento[];
};

export type SenalBehaviorReport = {
  anio: number;
  mes: number;
  from: string;
  to: string;
  timezone: string;
  sampleCount: number;
  deviceCount: number;
  source?: string;
  ensureStatus?: string;
  lastProcessedAt?: string | null;
  processedNew?: number;
  finalized?: boolean;
  processedOnce?: boolean;
  summary: {
    devicesWithWait: number;
    devicesWithOffline: number;
    devicesStillWaitOrOffline: number;
    peakWaitHour: number;
    peakOfflineHour: number;
    totalWaitMin: number;
    totalOfflineMin: number;
  };
  hourlyWaitMin: number[];
  hourlyOfflineMin: number[];
  devices: SenalDeviceBehavior[];
};
