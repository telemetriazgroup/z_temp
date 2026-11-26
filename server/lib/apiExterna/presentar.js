import { parseTelemetryDate } from '../timezone.js';
import { powerStateEfectivo } from '../powerEfectivo.js';
import { defrostActivoEfectivo, filaDefrostEfectivo } from '../powerState.js';
import {
  effectiveEnRangoFromDispositivo,
  rowEnRangoEffective,
  timestampRegistroHistorial,
} from '../historicalTelemetry.js';
import { deviceRowKey } from '../telemetry.js';
import { getDeviceNameByImei, getDeviceNameByRowKey } from '../deviceNamesRepository.js';

const SLOTS = [
  'numero_alarma',
  ...Array.from({ length: 12 }, (_, i) => `alarma_${String(i + 1).padStart(2, '0')}`),
];

const ORIGENES = new Map([
  ['TUNEL', 'TUNEL'],
  ['TERMOKING', 'TERMOKING'],
  ['THERMOKING', 'TERMOKING'],
  ['STARCOOL', 'STARCOOL'],
  ['STARCOOL2', 'STARCOOL2'],
]);

const MAX_HORAS = 168;
const MAX_PUNTOS = 8000;

export function origenCanonico(valor) {
  return ORIGENES.get(String(valor || '').trim().toUpperCase()) ?? null;
}

export function marcaDe(origen) {
  if (origen === 'STARCOOL' || origen === 'STARCOOL2') return 'StarCool';
  if (origen === 'TUNEL' || origen === 'TERMOKING') return 'Thermoking';
  return null;
}

function num(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function fechaIso(valor) {
  const d = valor instanceof Date ? valor : parseTelemetryDate(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fechaLima(valor) {
  const d = valor instanceof Date ? valor : parseTelemetryDate(valor);
  if (Number.isNaN(d.getTime())) return null;
  const texto = d.toLocaleString('sv-SE', {
    timeZone: 'America/Lima',
    hourCycle: 'h23',
  });
  return texto.slice(0, 16);
}

function alarmasDe(row) {
  const vistas = new Set();
  const alarmas = [];
  for (const campo of SLOTS) {
    const n = num(row?.[campo]);
    if (n == null || n === 0) continue;
    const codigo = Math.trunc(n);
    if (vistas.has(codigo)) continue;
    vistas.add(codigo);
    alarmas.push({ codigo });
  }
  return alarmas;
}

function encendidoDe(row, codigo) {
  const estado = powerStateEfectivo(row, codigo);
  if (estado === 1) return 'on';
  if (estado === 0) return 'off';
  return null;
}

function nombreDe(dispositivo) {
  const rowKey = deviceRowKey(dispositivo);
  return getDeviceNameByRowKey(rowKey) || getDeviceNameByImei(dispositivo?.imei) || null;
}

export function presentarEquipo(dispositivo) {
  const dato = dispositivo?.ultimo_dato ?? {};
  const origen = origenCanonico(dispositivo?.codigo) ?? dispositivo?.codigo ?? null;
  const conexion = ['online', 'wait', 'offline', 'historial'].includes(dispositivo?.estado_conexion)
    ? dispositivo.estado_conexion
    : 'offline';
  return {
    imei: String(dispositivo?.imei ?? ''),
    origen,
    marca: marcaDe(origen),
    nombre: nombreDe(dispositivo),
    conexion,
    encendido: encendidoDe(dato, origen),
    ultima_lectura: fechaIso(dato.created_at ?? dispositivo?.ultima_actualizacion),
    ultima_lectura_lima: fechaLima(dato.created_at ?? dispositivo?.ultima_actualizacion),
    minutos_sin_dato: num(dispositivo?.minutos_desde_ultimo_dato),
    set_point: num(dato.set_point),
    suministro: num(dato.temp_supply_1 ?? dato.supply_air_temp),
    retorno: num(dato.return_air ?? dato.return_air_temp),
    ambiente: num(dato.ambient_air),
    evaporador: num(dato.evaporation_coil),
    humedad: num(dato.relative_humidity),
    co2: num(dato.co2_reading),
    o2: num(dato.o2_reading),
    en_rango: effectiveEnRangoFromDispositivo(dispositivo),
    en_deshielo: defrostActivoEfectivo(dispositivo) === true,
    alarmas: alarmasDe(dato),
    latitud: num(dato.latitud),
    longitud: num(dato.longitud),
  };
}

export function presentarPunto(row, origen) {
  const ms = timestampRegistroHistorial(row);
  if (!Number.isFinite(ms)) return null;
  const cuando = new Date(ms);
  const alarmas = alarmasDe(row);
  return {
    fecha: cuando.toISOString(),
    fecha_lima: fechaLima(cuando),
    set_point: num(row.set_point),
    suministro: num(row.temp_supply_1 ?? row.supply_air_temp),
    retorno: num(row.return_air ?? row.return_air_temp),
    ambiente: num(row.ambient_air),
    evaporador: num(row.evaporation_coil),
    humedad: num(row.relative_humidity),
    encendido: encendidoDe(row, origen),
    en_rango: rowEnRangoEffective(row),
    en_deshielo: filaDefrostEfectivo(row, origen) === true,
    alarma: alarmas[0]?.codigo ?? null,
    alarmas,
    co2: num(row.co2_reading),
    o2: num(row.o2_reading),
  };
}

export function resumirFlota(equipos) {
  const cuenta = (campo, valor) => equipos.filter((e) => e[campo] === valor).length;
  return {
    total: equipos.length,
    online: cuenta('conexion', 'online'),
    wait: cuenta('conexion', 'wait'),
    offline: cuenta('conexion', 'offline'),
    historial: cuenta('conexion', 'historial'),
    encendidos: cuenta('encendido', 'on'),
    apagados: cuenta('encendido', 'off'),
  };
}

export function ventanaHistorial(query, ahora = new Date()) {
  const desdeRaw = String(query?.desde ?? '').trim();
  const hastaRaw = String(query?.hasta ?? '').trim();
  if (desdeRaw || hastaRaw) {
    const hasta = hastaRaw ? parseTelemetryDate(hastaRaw) : ahora;
    const desde = desdeRaw
      ? parseTelemetryDate(desdeRaw)
      : new Date(hasta.getTime() - 12 * 60 * 60 * 1000);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      throw Object.assign(new Error('Fecha inválida. Use YYYY-MM-DD HH:mm (hora Lima) o ISO.'), {
        status: 400,
      });
    }
    if (hasta.getTime() <= desde.getTime()) {
      throw Object.assign(new Error('hasta tiene que ser posterior a desde'), { status: 400 });
    }
    if (hasta.getTime() - desde.getTime() > MAX_HORAS * 60 * 60 * 1000) {
      throw Object.assign(new Error('El rango máximo del historial es 7 días'), { status: 400 });
    }
    return { desde, hasta };
  }
  let horas = Number(query?.horas ?? 12);
  if (!Number.isFinite(horas)) horas = 12;
  horas = Math.min(MAX_HORAS, Math.max(1, horas));
  return {
    desde: new Date(ahora.getTime() - horas * 60 * 60 * 1000),
    hasta: ahora,
    horas,
  };
}

export function serieHistorial(datos, origen) {
  const puntos = (Array.isArray(datos) ? datos : [])
    .map((row) => presentarPunto(row, origen))
    .filter(Boolean)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (puntos.length <= MAX_PUNTOS) {
    return { puntos, total: puntos.length, recortado: false };
  }
  const paso = puntos.length / MAX_PUNTOS;
  const recorte = [];
  for (let i = 0; i < MAX_PUNTOS; i += 1) recorte.push(puntos[Math.floor(i * paso)]);
  recorte[recorte.length - 1] = puntos[puntos.length - 1];
  return { puntos: recorte, total: puntos.length, recortado: true };
}
