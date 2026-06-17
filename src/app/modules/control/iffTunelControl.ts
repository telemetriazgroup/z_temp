import { TUNEL_CONTROL_ALL_IMEIS } from '../usuario/bootstrapUsers';

/** Cambio de setpoint: tipo 1, dato −30 … 15 °C */
export const COMANDO_TEMP_MIN = -30;
export const COMANDO_TEMP_MAX = 15;

/** Defrost: tipo 8, dato fijo 1 */
export const COMANDO_DEFROST_TIPO = 8 as const;
export const COMANDO_DEFROST_DATO = 1;

/** Stop plan: tipo 10, dato en segundos (UI en minutos 5–60) */
export const COMANDO_STOP_PLAN_TIPO = 10 as const;
export const COMANDO_STOP_MIN_MINUTOS = 5;
export const COMANDO_STOP_MAX_MINUTOS = 60;

export function esEquipoIffControlable(
  imei: string,
  codigo: string | undefined | null
): boolean {
  return codigo === 'TUNEL' && TUNEL_CONTROL_ALL_IMEIS.includes(imei);
}

export function clampTemperaturaComando(valor: number): number {
  return Math.min(COMANDO_TEMP_MAX, Math.max(COMANDO_TEMP_MIN, valor));
}

export function clampStopPlanMinutos(minutos: number): number {
  return Math.min(
    COMANDO_STOP_MAX_MINUTOS,
    Math.max(COMANDO_STOP_MIN_MINUTOS, Math.round(minutos))
  );
}

export function minutosStopPlanASegundos(minutos: number): number {
  return clampStopPlanMinutos(minutos) * 60;
}

export function temperaturaInicialControl(setPoint: number | null | undefined): number {
  if (setPoint != null && !Number.isNaN(setPoint)) {
    return clampTemperaturaComando(Math.round(setPoint));
  }
  return 0;
}
