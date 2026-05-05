import type { Alarm, AlarmConfig, Device, Group } from './types';

const now = Date.now();

function device(p: Partial<Device> & Pick<Device, 'id' | 'containerId' | 'nombre'>): Device {
  return {
    status: 'ONLINE',
    power: 'ON',
    tipo: 'Reefer',
    ultimaConexion: new Date(now - 120000).toISOString(),
    fechaMatricula: '2025-01-01',
    alarmas: 0,
    grupo: 'IFF',
    ubicacion: { lat: -12.0464, lng: -77.0428 },
    booking: `BK-${p.id.slice(-6)}`,
    temperaturaSetpoint: -22,
    temperaturaSuministro: -23.5,
    temperaturaRetorno: -22,
    temperaturaEvaporador: -23,
    temperaturaCompresor: -21,
    setpointCo2: 5,
    co2: 5.2,
    setpointO2: 20,
    o2: 20.1,
    usda1: 0,
    usda2: 0,
    usda3: 0,
    usda4: 0,
    medidorKW: 12.5,
    defrost: false,
    enRango: true,
    ...p,
  };
}

/** IDs = IMEI de telemetría (alineados con permisos IFF en usuarios bootstrap). */
export const mockDevices: Device[] = [
  device({
    id: '866262034327402',
    containerId: 'ZGRU5295105',
    nombre: 'IFF ZGRU5295105 MP BIXINAS',
  }),
  device({
    id: '863576046886862',
    containerId: 'ZGRU5014454',
    nombre: 'IFF ZGRU5014454 MATERIA PRIMA #1',
  }),
  device({
    id: '863576049740900',
    containerId: 'ZGRU5115406',
    nombre: 'IFF ZGRU5115406 MATERIA PRIMA #3',
    defrost: true,
  }),
  device({
    id: '868428044595035',
    containerId: 'ZGRU7807130',
    nombre: 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
    power: 'OFF',
    enRango: false,
  }),
  device({
    id: '863576043599872',
    containerId: 'ZGRU7802800',
    nombre: 'IFF ZGRU7802800 PRODUCTO TERMINADO #2',
  }),
  device({
    id: '866262034780196',
    containerId: 'ZGRU6645466',
    nombre: 'IFF ZGRU6645466 MATERIA PRIMA #2',
  }),
  device({
    id: '868428046606400',
    containerId: 'ZGRU-DEMO01',
    nombre: 'Unidad Demo ZTRACK',
    grupo: 'Otros',
  }),
];

export const mockAlarms: Alarm[] = [
  {
    id: 'al-1',
    containerId: 'ZGRU5295105',
    nombre: 'IFF ZGRU5295105 MP BIXINAS',
    alarma: 'Temperatura suministro fuera de umbral',
    atendida: false,
    fecha: new Date(now - 3600000).toISOString(),
    reportadaEmail: true,
  },
  {
    id: 'al-2',
    containerId: 'ZGRU7807130',
    nombre: 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
    alarma: 'Equipo apagado prolongado',
    atendida: true,
    fecha: new Date(now - 7200000).toISOString(),
    reportadaEmail: false,
  },
];

export const mockAlarmConfigs: AlarmConfig[] = [
  {
    id: 'cfg-1',
    containerId: 'all',
    tipo: 'sin_transmitir',
    tiempo: 2,
    unidadTiempo: 'horas',
    emails: ['operaciones@iff-pe.local'],
  },
];

export const mockGroups: Group[] = [
  { id: 'g1', nombre: 'IFF Perú', containerIds: mockDevices.slice(0, 6).map((d) => d.containerId) },
];

export interface ChartDatum {
  timestamp: number;
  setpoint: number;
  suministro: number;
  retorno: number;
  evaporador: number;
}

export function generateHistoricalData(
  deviceId: string,
  from: Date | undefined,
  to: Date | undefined
): ChartDatum[] {
  if (!from || !to) return [];
  const start = from.getTime();
  const end = to.getTime();
  if (!(end > start)) return [];
  const step = Math.max(60_000, Math.floor((end - start) / 120));
  const base = mockDevices.find((d) => d.id === deviceId)?.temperaturaSetpoint ?? -22;
  const out: ChartDatum[] = [];
  for (let t = start; t <= end; t += step) {
    const wave = Math.sin((t - start) / 3_600_000) * 1.5;
    out.push({
      timestamp: t,
      setpoint: base,
      suministro: base - 1.2 + wave,
      retorno: base - 0.5 + wave * 0.8,
      evaporador: base - 1 + wave * 0.6,
    });
  }
  return out;
}
