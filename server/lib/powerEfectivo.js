/** Por encima de esto hay consumo real: el equipo no está apagado. */
export const UMBRAL_FASE_ENCENDIDO_A = 0.1;

/** Starcool no trae fases. Suministro y retorno dentro de esta banda indican que regula. */
export const BANDA_STARCOOL_SETPOINT_C = 4;

const FASES = ['consumption_ph_1', 'consumption_ph_2', 'consumption_ph_3'];

export function origenConFases(codigo) {
  const c = String(codigo ?? '').trim().toUpperCase();
  return c === 'TERMOKING' || c === 'TUNEL' || c === 'THERMOKING';
}

export function origenStarcool(codigo) {
  const c = String(codigo ?? '').trim().toUpperCase();
  return c === 'STARCOOL' || c === 'STARCOOL2';
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function powerCrudo(row) {
  const n = num(row?.power_state);
  if (n == null) return null;
  if (n === 0) return 0;
  if (n === 1) return 1;
  return null;
}

/** Alguna fase por encima de 0.1 A: está consumiendo corriente. */
export function algunaFaseConsume(row) {
  return FASES.some((k) => {
    const n = num(row?.[k]);
    return n != null && n > UMBRAL_FASE_ENCENDIDO_A;
  });
}

export function sensoresAlrededorSetpoint(row, margenC = BANDA_STARCOOL_SETPOINT_C) {
  const sp = num(row?.set_point);
  const sup = num(row?.temp_supply_1 ?? row?.supply_air_temp);
  const ret = num(row?.return_air ?? row?.return_air_temp);
  if (sp == null || sup == null || ret == null) return false;
  return Math.abs(sup - sp) <= margenC && Math.abs(ret - sp) <= margenC;
}

/**
 * 1 encendido, 0 apagado, null sin dato.
 * Solo corrige un falso apagado. No apaga un equipo que la API marca encendido.
 * Fases: Thermoking y TUNEL. Starcool: suministro y retorno alrededor del setpoint.
 */
export function powerStateEfectivo(row, codigo) {
  const ps = powerCrudo(row);
  if (origenConFases(codigo) && algunaFaseConsume(row)) return 1;
  if (origenStarcool(codigo) && ps !== 1 && sensoresAlrededorSetpoint(row)) return 1;
  return ps;
}
