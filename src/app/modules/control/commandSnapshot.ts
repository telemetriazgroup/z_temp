import type { DispositivoUltimoEstado } from '../../types';
import { resolveAlarmSlotsFromDevice } from '../alarma';

/** Cambio concreto que se aplicará (antes → después). */
export interface ControlComandoCambio {
  campo: string;
  label: string;
  valorAnterior: string;
  valorNuevo: string;
}

/** Telemetría reefer del equipo justo antes de enviar el comando. */
export interface ControlEquipoSnapshot {
  capturadoEn: string;
  setPoint: number | null;
  tempSupply: number | null;
  returnAir: number | null;
  evaporationCoil: number | null;
  condensationCoil: number | null;
  compressCoil: number | null;
  capacityLoad: number | null;
  powerKwh: number | null;
  powerState: string | null;
  enDefrost: boolean | null;
  enRango: boolean | null;
  estadoConexion: string | null;
  alarmasActivas: number;
  telemetriaId: number | null;
}

function fmtTemp(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}°C`;
}

export function capturarSnapshotEquipo(d: DispositivoUltimoEstado): ControlEquipoSnapshot {
  const ud = d.ultimo_dato;
  return {
    capturadoEn: new Date().toISOString(),
    setPoint: ud.set_point ?? null,
    tempSupply: ud.temp_supply_1 ?? null,
    returnAir: ud.return_air ?? null,
    evaporationCoil: ud.evaporation_coil ?? null,
    condensationCoil: ud.condensation_coil ?? null,
    compressCoil: ud.compress_coil_1 ?? null,
    capacityLoad: ud.capacity_load ?? null,
    powerKwh: ud.power_kwh ?? null,
    powerState: d.power_state_texto ?? null,
    enDefrost: d.en_defrost ?? null,
    enRango: d.en_rango ?? null,
    estadoConexion: d.estado_conexion ?? null,
    alarmasActivas: resolveAlarmSlotsFromDevice(d).length,
    telemetriaId: ud.telemetria_id ?? null,
  };
}

export function buildCambioTemperatura(
  snapshot: ControlEquipoSnapshot,
  nuevoSetPoint: number
): ControlComandoCambio {
  return {
    campo: 'set_point',
    label: 'Temperatura Objetivo',
    valorAnterior: fmtTemp(snapshot.setPoint),
    valorNuevo: fmtTemp(nuevoSetPoint),
  };
}

export function buildCambioDefrost(snapshot: ControlEquipoSnapshot): ControlComandoCambio {
  return {
    campo: 'defrost',
    label: 'Defrost',
    valorAnterior:
      snapshot.enDefrost === true
        ? 'Activo'
        : snapshot.enDefrost === false
          ? 'Inactivo'
          : '—',
    valorNuevo: 'Iniciar ciclo',
  };
}

export function buildCambioStopPlan(minutos: number, segundos: number): ControlComandoCambio {
  return {
    campo: 'stop_plan',
    label: 'Stop plan',
    valorAnterior: 'Inactivo',
    valorNuevo: `${minutos} min (${segundos} s)`,
  };
}

/** Resumen legible del snapshot para tablas de auditoría. */
export function resumenSnapshotEquipo(s: ControlEquipoSnapshot): string {
  const partes = [
    `Set ${fmtTemp(s.setPoint)}`,
    `Sum ${fmtTemp(s.tempSupply)}`,
    `Ret ${fmtTemp(s.returnAir)}`,
    s.enDefrost === true ? 'Defrost ON' : null,
    s.alarmasActivas > 0 ? `${s.alarmasActivas} alarma(s)` : null,
  ].filter(Boolean);
  return partes.join(' · ');
}

export function formatearCambioResumen(c: ControlComandoCambio): string {
  return `${c.label}: ${c.valorAnterior} → ${c.valorNuevo}`;
}
