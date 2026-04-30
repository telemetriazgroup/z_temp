import type { DispositivoUltimoEstado } from '../types';

/** Serialización estable para detectar si la telemetría cambió al refrescar. */
export function telemetriaComparablePayload(d: DispositivoUltimoEstado): string {
  return JSON.stringify({
    imei: d.imei,
    codigo: d.codigo,
    estado_conexion: d.estado_conexion,
    ultima_actualizacion: d.ultima_actualizacion,
    minutos_desde_ultimo_dato: d.minutos_desde_ultimo_dato,
    power_state_texto: d.power_state_texto,
    en_rango: d.en_rango,
    en_defrost: d.en_defrost,
    ultimo_dato: d.ultimo_dato,
  });
}

/** Nivel CO₂ / O₂ válido solo en [0, 24]; fuera del rango se trata como nulo. */
export function nivelCo2O2Valido(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0 || value > 24) return null;
  return value;
}

export function textoEstadoPowerState(value: number | null | undefined): string {
  if (value === 0) return 'Apagado (0)';
  if (value === 1) return 'Encendido (1)';
  return '—';
}

export function formatearNumero(value: number | null | undefined, sufijo = ''): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value}${sufijo}`;
}
