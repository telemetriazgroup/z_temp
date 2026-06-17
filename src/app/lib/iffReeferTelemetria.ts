import type { DispositivoUltimoEstado, UltimoDatoDispositivo } from '../types';
import { resolveAlarmSlotsFromDevice } from '../modules/alarma';
import {
  formatearNumero,
  textoEstadoPowerState,
} from './telemetriaDetalle';

export interface ReeferDatoItem {
  id: string;
  label: string;
  value: string;
}

function fmtTemp(v: number | null | undefined): string {
  return formatearNumero(v, ' °C');
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v} %`;
}

/** Tarjetas resumidas de estatus reefer (sin etileno / CO₂ — no es madurador). */
export function buildReeferEstatusCards(d: DispositivoUltimoEstado): ReeferDatoItem[] {
  const ud = d.ultimo_dato;
  const alarmas = resolveAlarmSlotsFromDevice(d);
  const alarmasCount = alarmas.length;

  return [
    { id: 'set_point', label: 'Set point', value: fmtTemp(ud.set_point) },
    { id: 'temp_supply_1', label: 'T° Suministro', value: fmtTemp(ud.temp_supply_1) },
    { id: 'return_air', label: 'T° Retorno', value: fmtTemp(ud.return_air) },
    { id: 'evaporation_coil', label: 'Evaporador', value: fmtTemp(ud.evaporation_coil) },
    { id: 'condensation_coil', label: 'Condensador', value: fmtTemp(ud.condensation_coil) },
    { id: 'compress_coil_1', label: 'T° Compresor', value: fmtTemp(ud.compress_coil_1) },
    { id: 'capacity_load', label: 'Potencia', value: fmtPct(ud.capacity_load) },
    { id: 'power_kwh', label: 'Consumo', value: formatearNumero(ud.power_kwh, ' kWh') },
    {
      id: 'alarmas',
      label: 'Alarmas',
      value: alarmasCount === 0 ? '0' : String(alarmasCount),
    },
    {
      id: 'en_rango',
      label: 'En rango',
      value:
        d.en_rango == null ? '—' : d.en_rango ? 'Sí' : 'No',
    },
    {
      id: 'defrost',
      label: 'Defrost',
      value: d.en_defrost === true ? 'Activo' : d.en_defrost === false ? 'No' : '—',
    },
    {
      id: 'power',
      label: 'Equipo',
      value:
        d.power_state_texto === 'on'
          ? 'ON'
          : d.power_state_texto === 'off'
            ? 'OFF'
            : '—',
    },
  ];
}

/** Detalle ampliado de telemetría reefer recibida del equipo. */
export function buildReeferDetalleItems(
  d: DispositivoUltimoEstado
): { principal: ReeferDatoItem[]; sensores: ReeferDatoItem[]; meta: ReeferDatoItem[] } {
  const ud = d.ultimo_dato;

  const principal: ReeferDatoItem[] = [
    { id: 'set_point', label: 'Set temperatura', value: fmtTemp(ud.set_point) },
    { id: 'temp_supply_1', label: 'T. suministro', value: fmtTemp(ud.temp_supply_1) },
    { id: 'return_air', label: 'T. retorno', value: fmtTemp(ud.return_air) },
    { id: 'evaporation_coil', label: 'Evaporador', value: fmtTemp(ud.evaporation_coil) },
    { id: 'condensation_coil', label: 'Condensador', value: fmtTemp(ud.condensation_coil) },
    { id: 'compress_coil_1', label: 'T. compresor', value: fmtTemp(ud.compress_coil_1) },
    { id: 'capacity_load', label: 'Potencia', value: fmtPct(ud.capacity_load) },
    { id: 'power_kwh', label: 'Consumo eléctrico', value: formatearNumero(ud.power_kwh, ' kWh') },
    {
      id: 'power_state',
      label: 'Estado motor',
      value: textoEstadoPowerState(ud.power_state),
    },
  ];

  const sensores: ReeferDatoItem[] = [
    { id: 'cargo_1_temp', label: 'Sensor carga 1', value: fmtTemp(ud.cargo_1_temp) },
    { id: 'cargo_2_temp', label: 'Sensor carga 2', value: fmtTemp(ud.cargo_2_temp) },
    { id: 'cargo_3_temp', label: 'Sensor carga 3', value: fmtTemp(ud.cargo_3_temp) },
    { id: 'cargo_4_temp', label: 'Sensor carga 4', value: fmtTemp(ud.cargo_4_temp) },
  ];

  const meta: ReeferDatoItem[] = [
    {
      id: 'estado_conexion',
      label: 'Conexión',
      value: d.estado_conexion?.toUpperCase() ?? '—',
    },
    {
      id: 'en_rango',
      label: 'Temperatura en rango',
      value: d.en_rango == null ? '—' : d.en_rango ? 'Sí' : 'No',
    },
    {
      id: 'en_defrost',
      label: 'Defrost',
      value: d.en_defrost === true ? 'Activo' : d.en_defrost === false ? 'Inactivo' : '—',
    },
    {
      id: 'ultima_actualizacion',
      label: 'Última telemetría',
      value: formatFechaEquipo(ud.created_at ?? d.ultima_actualizacion),
    },
    {
      id: 'telemetria_id',
      label: 'ID telemetría',
      value: ud.telemetria_id != null ? String(ud.telemetria_id) : '—',
    },
    {
      id: 'ubicacion',
      label: 'Ubicación',
      value: formatUbicacion(ud),
    },
  ];

  return { principal, sensores, meta };
}

function formatFechaEquipo(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUbicacion(ud: UltimoDatoDispositivo): string {
  const lat = ud.latitud;
  const lng = ud.longitud;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return '—';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export const IFF_NO_MADURADOR_NOTA =
  'Contenedor reefer (Termo King MP4000). Etileno, CO₂ y ventilación AFAM+ no aplican — no es unidad maduradora.';
