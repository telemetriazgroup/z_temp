/** power_state 1 = encendido, 0 = apagado (telemetría TUNEL/STARCOOL). */

export function isEquipoApagado(dispositivo) {
  if (dispositivo == null) return null;
  const ps = dispositivo.ultimo_dato?.power_state;
  if (ps === 0) return true;
  if (ps === 1) return false;
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

export function filaDefrostEfectivo(row) {
  if (row?.en_defrost !== true) return false;
  if (row.power_state === 0) return false;
  if (row.power_state === 1) return true;
  return false;
}
