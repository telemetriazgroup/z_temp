import { Device, Alarm, AlarmConfig, Group } from './types';

// Generar datos mock para dispositivos
export const mockDevices: Device[] = Array.from({ length: 25 }, (_, i) => {
  const statuses: ('ONLINE' | 'WAIT' | 'OFFLINE')[] = ['ONLINE', 'WAIT', 'OFFLINE'];
  const powers: ('ON' | 'OFF')[] = ['ON', 'OFF'];
  const tipos: ('Reefer' | 'Genset' | 'Ripener' | 'Blast-F' | 'Blast-C')[] = ['Reefer', 'Genset', 'Ripener', 'Blast-F', 'Blast-C'];
  const grupos = ['free', 'Grupo A', 'Grupo B', 'Grupo C'];
  
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const power = powers[Math.floor(Math.random() * powers.length)];
  const tipo = tipos[Math.floor(Math.random() * tipos.length)];
  const grupo = grupos[Math.floor(Math.random() * grupos.length)];
  const defrost = Math.random() > 0.8;
  const tempSetpoint = -18 + Math.random() * 5;
  const tempSuministro = tempSetpoint + (Math.random() - 0.5) * 4;
  const enRango = Math.abs(tempSuministro - tempSetpoint) < 2;
  
  const containerId = `ZGRU${2000000 + i}-${Math.floor(Math.random() * 9) + 1}`;
  
  return {
    id: `device-${i}`,
    containerId,
    nombre: Math.random() > 0.5 ? containerId : `Container ${i + 1}`,
    status,
    power,
    tipo,
    ultimaConexion: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    fechaMatricula: new Date(Date.now() - Math.random() * 86400000 * 365).toISOString(),
    alarmas: Math.floor(Math.random() * 5),
    grupo,
    ubicacion: { lat: -12.0464 + (Math.random() - 0.5) * 0.5, lng: -77.0428 + (Math.random() - 0.5) * 0.5 },
    booking: `BK${100000 + i}`,
    temperaturaSetpoint: tempSetpoint,
    temperaturaSuministro: tempSuministro,
    temperaturaRetorno: tempSuministro + (Math.random() - 0.5) * 2,
    temperaturaEvaporador: tempSuministro - 5 + Math.random() * 3,
    temperaturaCompresor: 40 + Math.random() * 20,
    setpointCo2: 5,
    co2: 5 + (Math.random() - 0.5) * 2,
    setpointO2: 21,
    o2: 21 + (Math.random() - 0.5) * 2,
    usda1: Math.random() * 100,
    usda2: Math.random() * 100,
    usda3: Math.random() * 100,
    usda4: Math.random() * 100,
    medidorKW: 1.5 + Math.random() * 3,
    defrost,
    enRango
  };
});

// Generar datos mock para alarmas
export const mockAlarms: Alarm[] = Array.from({ length: 15 }, (_, i) => {
  const device = mockDevices[Math.floor(Math.random() * mockDevices.length)];
  const alarmas = [
    'Temperatura alta en suministro',
    'Temperatura baja en retorno',
    'Dispositivo sin transmitir',
    'Dispositivo apagado prolongado',
    'Defrost activado',
    'Fuera de rango temperatura'
  ];
  
  return {
    id: `alarm-${i}`,
    containerId: device.containerId,
    nombre: device.nombre,
    alarma: alarmas[Math.floor(Math.random() * alarmas.length)],
    atendida: Math.random() > 0.6,
    fecha: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    reportadaEmail: Math.random() > 0.5
  };
});

// Configuraciones de alarma mock
export const mockAlarmConfigs: AlarmConfig[] = [
  {
    id: 'config-1',
    containerId: 'all',
    tipo: 'apagado',
    tiempo: 2,
    unidadTiempo: 'horas',
    emails: ['admin@ztrack.com', 'monitor@ztrack.com']
  },
  {
    id: 'config-2',
    containerId: mockDevices[0].containerId,
    tipo: 'temp_suministro_alta',
    valor: -10,
    emails: ['admin@ztrack.com']
  }
];

// Grupos mock
export const mockGroups: Group[] = [
  {
    id: 'group-1',
    nombre: 'Grupo A',
    containerIds: [mockDevices[0].containerId, mockDevices[1].containerId, mockDevices[2].containerId]
  },
  {
    id: 'group-2',
    nombre: 'Grupo B',
    containerIds: [mockDevices[3].containerId, mockDevices[4].containerId]
  },
  {
    id: 'group-3',
    nombre: 'Grupo C',
    containerIds: [mockDevices[5].containerId]
  }
];

// Datos históricos para gráficos
export function generateHistoricalData(deviceId: string, startDate?: Date, endDate?: Date) {
  const device = mockDevices.find(d => d.id === deviceId);
  if (!device) return [];
  
  const data = [];
  const now = endDate ? endDate.getTime() : Date.now();
  const start = startDate ? startDate.getTime() : now - (24 * 3600000); // Default: últimas 24 horas
  
  // Calcular el número de puntos de datos basado en el rango
  const timeDiff = now - start;
  const hoursInRange = timeDiff / 3600000;
  const dataPoints = Math.min(Math.max(Math.floor(hoursInRange), 24), 168); // Mínimo 24, máximo 168 (7 días)
  const interval = timeDiff / dataPoints;
  
  for (let i = 0; i < dataPoints; i++) {
    const timestamp = new Date(start + (i * interval));
    data.push({
      timestamp: timestamp.toISOString(),
      setpoint: device.temperaturaSetpoint,
      suministro: device.temperaturaSetpoint + (Math.random() - 0.5) * 4,
      retorno: device.temperaturaSetpoint + (Math.random() - 0.5) * 5,
      evaporador: device.temperaturaSetpoint - 5 + (Math.random() - 0.5) * 3
    });
  }
  
  return data;
}