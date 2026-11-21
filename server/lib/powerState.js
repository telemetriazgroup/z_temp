/** power_state 1 = encendido, 0 = apagado, corregido por fases o por sensores. */

import { powerStateEfectivo } from './powerEfectivo.js';

export function isEquipoApagado(dispositivo) {
  if (dispositivo == null) return null;
  const efectivo = powerStateEfectivo(dispositivo.ultimo_dato, dispositivo.codigo);
  if (efectivo === 0) return true;
  if (efectivo === 1) return false;
  if (dispositivo.power_state_texto === 'off') return true;
  if (dispositivo.power_state_texto === 'on') return false;
  return null;
}

export function isEquipoEncendido(dispositivo) {
  const apagado = isEquipoApagado(dispositivo);
  if (apagado === true) return false;
  if (apagado === false) return true;
  return null;
}

/** Defrost válido solo con equipo ON; OFF + defrost en telemetría no cuenta como defrost. */
export function defrostActivoEfectivo(dispositivo) {
  return isEquipoEncendido(dispositivo) === true && dispositivo.en_defrost === true;
}

export function filaDefrostEfectivo(row, codigo = null) {
  if (row?.en_defrost !== true) return false;
  return powerStateEfectivo(row, codigo ?? row.codigo) === 1;
}
