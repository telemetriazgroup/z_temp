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

export type SenalEpisode = {
  tipo: 'wait' | 'offline';
  startedAt: string;
  endedAt: string;
  durationMin: number;
  recovered: boolean;
  open?: boolean;
  startHour: number;
  endHour: number;
};

export type SenalDeviceBehavior = {
  imei: string;
  codigo: string | null;
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
  ubicacion: SenalUbicacion | null;
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
