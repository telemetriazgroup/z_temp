export type AnalisisClasificacion =
  | 'autorizado'
  | 'programado'
  | 'no_previsto'
  | 'sin_clasificar';

export type AnalisisEventoTipo =
  | 'apagado'
  | 'fuera_rango'
  | 'sin_transmision'
  | 'validar_datos';

export interface AnalisisRangoConfig {
  setPoint?: number | null;
  bandaMin?: number | null;
  bandaMax?: number | null;
  margenInferior?: number | null;
  margenSuperior?: number | null;
  useRangoPersonalizado?: boolean;
  label?: string;
  falsosApagadoDescartados?: number;
  minApagadoMinutos?: number;
  fueraRangoCortosDescartados?: number;
  minFueraRangoMinutos?: number;
}

export interface AnalisisMensual {
  id: string;
  imei: string;
  codigo: string;
  rowKey: string;
  anio: number;
  mes: number;
  zonaHoraria: string;
  rangoConfigSnapshot: AnalisisRangoConfig | null;
  analizadoDesde: string | null;
  analizadoHasta: string | null;
  estado: 'parcial' | 'cerrado_mes';
  createdAt: string;
  updatedAt: string;
}

export interface AnalisisEvento {
  id: string;
  analisisId: string;
  tipo: 'apagado' | 'fuera_rango' | 'sin_transmision';
  tipoUi: AnalisisEventoTipo;
  label: string;
  since: string;
  until: string | null;
  durationHours: number;
  durationMinutes?: number;
  clasificacion: AnalisisClasificacion;
  detalle: string | null;
  hashIntervalo: string;
  clasificadoPor?: string | null;
  clasificadoAt?: string | null;
}

export interface AnalisisSemana {
  semanaIndex: number;
  desde: string;
  hasta: string;
  horasFueraRango: number;
  horasApagado: number;
  horasSinTransmision: number;
}

export interface AnalisisCompleto {
  analisis: AnalisisMensual;
  eventos: AnalisisEvento[];
  semanas: AnalisisSemana[];
  resumen: {
    totalEventos: number;
    horasFueraRango: number;
    horasApagado: number;
    horasSinTransmision: number;
  };
  meta?: {
    falsosApagadoDescartados?: number;
    minApagadoMinutos?: number;
    fueraRangoCortosDescartados?: number;
    minFueraRangoMinutos?: number;
    rangoUsado?: AnalisisRangoConfig;
  };
}

export interface AnalisisSeriePunto {
  ts: string;
  fuente: string;
  set_point?: number | null;
  return_air?: number | null;
  temp_supply_1?: number | null;
  evaporation_coil?: number | null;
  power_state?: number | null;
  [key: string]: unknown;
}
