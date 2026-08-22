export type DeviceStatus = 'ONLINE' | 'WAIT' | 'OFFLINE';
export type PowerStatus = 'ON' | 'OFF';
export type DeviceType = 'Reefer' | 'Genset' | 'Ripener' | 'Blast-F' | 'Blast-C';
export type UserRole = 'Administrador' | 'Monitoreo' | 'Solo Vista';

/**
 * Jerarquía de cuentas:
 * - superadmin: acceso total + auditoría + gestión sin cuota
 * - admin: ve todos los dispositivos, gestiona hasta N usuarios (default 3), sin auditoría
 * - user: operativo / monitoreo según role y deviceAccess
 */
export type UserCategory = 'superadmin' | 'admin' | 'user';

/** Origen del dispositivo en el listado agregado. */
export type DispositivoOrigenCodigo =
  | 'TUNEL'
  | 'STARCOOL'
  | 'STARCOOL2'
  | 'TERMOKING';

export interface Device {
  id: string;
  containerId: string;
  nombre: string;
  status: DeviceStatus;
  power: PowerStatus;
  tipo: DeviceType;
  ultimaConexion: string;
  fechaMatricula: string;
  alarmas: number;
  grupo: string;
  ubicacion: { lat: number; lng: number };
  booking: string;
  temperaturaSetpoint: number;
  temperaturaSuministro: number;
  temperaturaRetorno: number;
  temperaturaEvaporador: number;
  temperaturaCompresor: number;
  setpointCo2: number;
  co2: number;
  setpointO2: number;
  o2: number;
  usda1: number;
  usda2: number;
  usda3: number;
  usda4: number;
  medidorKW: number;
  defrost: boolean;
  enRango: boolean;
}

export interface Alarm {
  id: string;
  containerId: string;
  nombre: string;
  alarma: string;
  atendida: boolean;
  fecha: string;
  reportadaEmail: boolean;
}

export type UserSexo = 'M' | 'F' | 'O';

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  /** `['all']` = todos los IMEI. Si no es superusuario, lista explícita de IMEI. */
  deviceAccess: string[];
  /** Acceso global y gestión de usuarios (CRUD). Legacy: equivale a category superadmin. */
  superUser?: boolean;
  /** Categoría jerárquica (preferida sobre solo superUser). */
  category?: UserCategory;
  /**
   * Tope de usuarios que un admin puede crear (default 3).
   * Solo el superadmin puede subir este valor.
   */
  maxManagedUsers?: number;
  /** Username del creador (cuota de admin). */
  createdBy?: string;
  /** Etiquetas fijas por IMEI (p. ej. cuenta IFF Perú). */
  deviceNames?: Record<string, string>;
  /** Orígenes visibles (TUNEL, STARCOOL, STARCOOL2, TERMOKING). Si se omite, todos. */
  allowedCodigos?: DispositivoOrigenCodigo[];
  /**
   * Grupos de equipos asignados a la cuenta.
   * El acceso efectivo = deviceAccess ∪ IMEIs de estos grupos.
   */
  groupIds?: string[];
  /**
   * Permite ver y usar el panel de control de temperaturas (setpoint, defrost, stop).
   * Desactivado por defecto; el superadmin siempre lo tiene.
   * Un admin solo puede otorgarlo si el superadmin se lo habilitó a él.
   */
  puedeControlTemperatura?: boolean;
  /**
   * Permite usar Análisis de telemetría en el detalle del equipo.
   * Misma regla de transferencia que control de temperatura.
   */
  puedeAnalisisTelemetria?: boolean;
  /**
   * Fecha de inicio de acceso a datos por IMEI (YYYY-MM-DD o ISO).
   * Si falta, se asume la fecha de asignación. Superadmin sin restricción.
   */
  deviceAccessFrom?: Record<string, string>;
  /**
   * Historial de ventanas de acceso (reasignaciones).
   * `to` null = vigente.
   */
  deviceAccessHistory?: Array<{
    imei: string;
    from: string;
    to?: string | null;
    assignedAt: string;
    assignedBy?: string;
  }>;
  /** Nombre visible en navbar / perfil (derivable de nombres+apellidos). */
  displayName?: string;
  /** Preferencia de zona para visualización (GMT-4 / GMT-5). */
  zonaHoraria?: 'GMT-4' | 'GMT-5' | string;
  /** Unidad de temperatura en tablas/listados. Default °C. */
  temperaturaUnidad?: 'C' | 'F';
  /** URL opcional de avatar; si falta se usan iniciales. */
  avatarUrl?: string;
  /** Datos personales opcionales */
  cargo?: string;
  nombres?: string;
  apellidos?: string;
  dni?: string;
  correo?: string;
  telefono?: string;
  sexo?: UserSexo;
  /** Empresa asignada (módulo empresa). */
  empresaId?: string;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  actorUsername: string;
  actorId?: string;
  action: string;
  module: string;
  summary: string;
  targetUsername?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

export interface Empresa {
  id: string;
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  activo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AlarmConfig {
  id: string;
  containerId: string;
  tipo: 'apagado' | 'sin_transmitir' | 'temp_suministro_alta' | 'temp_retorno_alta' | 'temp_retorno_baja';
  valor?: number;
  tiempo?: number;
  unidadTiempo?: 'horas' | 'minutos';
  emails: string[];
}

/**
 * Grupo de equipos reefer para ACL / asignaciones (Administración).
 * Opcionalmente referenciado a una empresa.
 */
export interface GrupoEquipo {
  id: string;
  nombre: string;
  /** Empresa de referencia (opcional). */
  empresaId?: string | null;
  /** IMEIs de equipos en el grupo. */
  imeis: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** @deprecated Usar GrupoEquipo. Alias legacy del mock de Administración. */
export interface Group {
  id: string;
  nombre: string;
  containerIds: string[];
}

// --- API TermoKing: ultimo_estado_dispositivos ---

export interface UltimoDatoDispositivo {
  temp_supply_1: number | null;
  return_air: number | null;
  evaporation_coil: number | null;
  condensation_coil: number | null;
  compress_coil_1: number | null;
  co2_reading: number | null;
  o2_reading: number | null;
  cargo_1_temp: number | null;
  cargo_2_temp: number | null;
  cargo_3_temp: number | null;
  cargo_4_temp: number | null;
  power_kwh: number | null;
  numero_alarma: number | null;
  /** Códigos de alarma activos adicionales (túnel IFF / MP4000). */
  alarma_01?: number | null;
  alarma_02?: number | null;
  alarma_03?: number | null;
  alarma_04?: number | null;
  alarma_05?: number | null;
  alarma_06?: number | null;
  alarma_07?: number | null;
  alarma_08?: number | null;
  alarma_09?: number | null;
  alarma_10?: number | null;
  alarma_11?: number | null;
  alarma_12?: number | null;
  sp_ethyleno: number | null;
  set_point_o2: number | null;
  set_point_co2: number | null;
  power_state: number | null;
  capacity_load: number | null;
  telemetria_id: number | null;
  created_at: string | null;
  longitud: number | null;
  latitud: number | null;
  set_point: number | null;
}

export interface DispositivoUltimoEstado {
  imei: string;
  estado_conexion: 'online' | 'offline' | 'wait';
  ultima_actualizacion: string | null;
  minutos_desde_ultimo_dato: number | null;
  power_state_texto: 'on' | 'off' | null;
  en_rango: boolean | null;
  en_defrost: boolean | null;
  ultimo_dato: UltimoDatoDispositivo;
  /** Asignado en cliente al unificar respuestas de varias APIs. */
  codigo?: DispositivoOrigenCodigo;
}

export interface ResumenDispositivos {
  total_dispositivos: number;
  online: number;
  wait: number;
  offline: number;
  en_defrost: number;
  power_on: number;
  power_off: number;
  zona_horaria: string;
}

export interface UltimoEstadoDispositivosResponse {
  data: {
    resumen: ResumenDispositivos;
    dispositivos: DispositivoUltimoEstado[];
  };
}

/** Registro de telemetría en respuesta de `buscar_datos_oficiales`. */
export interface DatoOficialHistorial {
  id?: number;
  set_point?: number | null;
  temp_supply_1?: number | null;
  temp_supply_2?: number | null;
  return_air?: number | null;
  evaporation_coil?: number | null;
  condensation_coil?: number | null;
  compress_coil_1?: number | null;
  compress_coil_2?: number | null;
  ambient_air?: number | null;
  cargo_1_temp?: number | null;
  cargo_2_temp?: number | null;
  cargo_3_temp?: number | null;
  cargo_4_temp?: number | null;
  relative_humidity?: number | null;
  avl?: number | null;
  line_voltage?: number | null;
  line_frequency?: number | null;
  consumption_ph_1?: number | null;
  consumption_ph_2?: number | null;
  consumption_ph_3?: number | null;
  o2_reading?: number | null;
  co2_reading?: number | null;
  set_point_o2?: number | null;
  set_point_co2?: number | null;
  evaporator_speed?: number | null;
  condenser_speed?: number | null;
  battery_voltage?: number | null;
  power_kwh?: number | null;
  supply_air_temp?: number | null;
  return_air_temp?: number | null;
  dl_battery_temp?: number | null;
  power_consumption?: number | null;
  power_consumption_avg?: number | null;
  alarm_present?: number | null;
  capacity_load?: number | null;
  power_state?: number | null;
  controlling_mode?: number | null;
  humidity_control?: number | null;
  humidity_set_point?: number | null;
  fresh_air_ex_mode?: number | null;
  defrost_term_temp?: number | null;
  defrost_interval?: number | null;
  sp_ethyleno?: number | null;
  inyeccion_hora?: number | null;
  ethylene?: number | null;
  numero_alarma?: number | null;
  alarma_01?: number | null;
  alarma_02?: number | null;
  /** Fecha de registro (preferida si existe). */
  created_at?: string | null;
  /** Alternativa cuando la API no envía `created_at`. */
  fecha?: string | null;
  /** Indicador en_rango si la API lo incluye en historial. */
  en_rango?: boolean | null;
  [key: string]: unknown;
}

export interface BuscarDatosOficialesResponse {
  data: {
    imei: string;
    fecha_inicial: string;
    fecha_final: string;
    total_datos: number;
    datos: DatoOficialHistorial[];
  };
  code: number;
  message: string;
}
