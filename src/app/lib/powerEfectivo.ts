/** Por encima de esto hay consumo real: el equipo no está apagado. */
export const UMBRAL_FASE_ENCENDIDO_A = 0.1;

/** Starcool no trae fases. Suministro y retorno dentro de esta banda indican que regula. */
export const BANDA_STARCOOL_SETPOINT_C = 4;

const FASES = ['consumption_ph_1', 'consumption_ph_2', 'consumption_ph_3'] as const;

type FilaPower = {
  power_state?: number | null;
  consumption_ph_1?: number | null;
  consumption_ph_2?: number | null;
  consumption_ph_3?: number | null;
  set_point?: number | null;
  temp_supply_1?: number | null;
  supply_air_temp?: number | null;
  return_air?: number | null;
  return_air_temp?: number | null;
};

export function origenConFases(codigo?: string | null): boolean {
  const c = String(codigo ?? '').trim().toUpperCase();
  return c === 'TERMOKING' || c === 'TUNEL' || c === 'THERMOKING';
}

export function origenStarcool(codigo?: string | null): boolean {
  const c = String(codigo ?? '').trim().toUpperCase();
  return c === 'STARCOOL' || c === 'STARCOOL2';
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

export function powerCrudo(row: FilaPower | null | undefined): 0 | 1 | null {
  const n = num(row?.power_state);
  if (n == null) return null;
  if (n === 0) return 0;
  if (n === 1) return 1;
  return null;
}

export function algunaFaseConsume(row: FilaPower | null | undefined): boolean {
  return FASES.some((k) => {
    const n = num(row?.[k]);
    return n != null && n > UMBRAL_FASE_ENCENDIDO_A;
  });
}

export function sensoresAlrededorSetpoint(
  row: FilaPower | null | undefined,
  margenC = BANDA_STARCOOL_SETPOINT_C
): boolean {
  const sp = num(row?.set_point);
  const sup = num(row?.temp_supply_1 ?? row?.supply_air_temp);
  const ret = num(row?.return_air ?? row?.return_air_temp);
  if (sp == null || sup == null || ret == null) return false;
  return Math.abs(sup - sp) <= margenC && Math.abs(ret - sp) <= margenC;
}

/**
 * 1 encendido, 0 apagado, null sin dato.
 * Solo corrige un falso apagado. Fases en Thermoking y TUNEL.
 * Starcool: suministro y retorno alrededor del setpoint.
 */
export function powerStateEfectivo(
  row: FilaPower | null | undefined,
  codigo?: string | null
): 0 | 1 | null {
  const ps = powerCrudo(row);
  if (origenConFases(codigo) && algunaFaseConsume(row)) return 1;
  if (origenStarcool(codigo) && ps !== 1 && sensoresAlrededorSetpoint(row)) return 1;
  return ps;
}
