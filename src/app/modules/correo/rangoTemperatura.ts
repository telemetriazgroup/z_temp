import type { DeviceAlertConfig } from './types';
import type { DispositivoUltimoEstado } from '../../types';
import { powerStateEfectivo } from '../../lib/powerEfectivo';

export function isEquipoApagado(dispositivo: DispositivoUltimoEstado): boolean | null {
  const efectivo = powerStateEfectivo(dispositivo.ultimo_dato, dispositivo.codigo);
  if (efectivo === 0) return true;
  if (efectivo === 1) return false;
  if (dispositivo.power_state_texto === 'off') return true;
  if (dispositivo.power_state_texto === 'on') return false;
  return null;
}

export function isEquipoEncendido(dispositivo: DispositivoUltimoEstado): boolean | null {
  const apagado = isEquipoApagado(dispositivo);
  if (apagado === true) return false;
  if (apagado === false) return true;
  return null;
}

export function defrostActivoEfectivo(dispositivo: DispositivoUltimoEstado): boolean {
  return isEquipoEncendido(dispositivo) === true && dispositivo.en_defrost === true;
}

export type EstadoRangoListado = 'apagado' | 'normal' | 'fuera' | 'indeterminado';

/** Tolerancia histórica cuando no hay setpoint. Las bandas reales salen de la configuración. */
export const TOLERANCIA_SETPOINT_C = 4;

export interface RangoPredeterminado {
  frioHasta: number;
  frioMargen: number;
  medioHasta: number;
  medioMargen: number;
  templadoHasta: number;
  templadoMargen: number;
  calidoMargen: number;
}

export const RANGO_PREDETERMINADO_DEFAULT: RangoPredeterminado = {
  frioHasta: -6,
  frioMargen: 4,
  medioHasta: 16,
  medioMargen: 6,
  templadoHasta: 21,
  templadoMargen: 8,
  calidoMargen: 10,
};

let rangoPredeterminadoActual: RangoPredeterminado = { ...RANGO_PREDETERMINADO_DEFAULT };

export function aplicarRangoPredeterminado(cfg: Partial<RangoPredeterminado> | null | undefined) {
  const d = RANGO_PREDETERMINADO_DEFAULT;
  const next: RangoPredeterminado = {
    frioHasta: Number.isFinite(Number(cfg?.frioHasta)) ? Number(cfg?.frioHasta) : d.frioHasta,
    frioMargen: Number.isFinite(Number(cfg?.frioMargen)) ? Number(cfg?.frioMargen) : d.frioMargen,
    medioHasta: Number.isFinite(Number(cfg?.medioHasta)) ? Number(cfg?.medioHasta) : d.medioHasta,
    medioMargen: Number.isFinite(Number(cfg?.medioMargen)) ? Number(cfg?.medioMargen) : d.medioMargen,
    templadoHasta: Number.isFinite(Number(cfg?.templadoHasta)) ? Number(cfg?.templadoHasta) : d.templadoHasta,
    templadoMargen: Number.isFinite(Number(cfg?.templadoMargen)) ? Number(cfg?.templadoMargen) : d.templadoMargen,
    calidoMargen: Number.isFinite(Number(cfg?.calidoMargen)) ? Number(cfg?.calidoMargen) : d.calidoMargen,
  };
  rangoPredeterminadoActual = next;
  return next;
}

export function margenPredeterminado(setPoint: number | null | undefined): number {
  const cfg = rangoPredeterminadoActual;
  const sp = Number(setPoint);
  if (!Number.isFinite(sp) || sp <= cfg.frioHasta) return cfg.frioMargen;
  if (sp < cfg.medioHasta) return cfg.medioMargen;
  if (sp < cfg.templadoHasta) return cfg.templadoMargen;
  return cfg.calidoMargen;
}

export function toleranciaSetpointDefault(setPoint: number): number {
  return margenPredeterminado(setPoint);
}

export function rangoOptsFromConfig(cfg: DeviceAlertConfig | null | undefined) {
  if (!cfg?.useRangoPersonalizado) return null;
  return {
    useRangoPersonalizado: true as const,
    margenInferior: cfg.margenInferior ?? 0.5,
    margenSuperior: cfg.margenSuperior ?? 0.5,
  };
}

export function getMargenesSetpoint(
  setPoint: number | null | undefined,
  cfg: DeviceAlertConfig | null | undefined
): { inferior: number; superior: number; personalizado: boolean } {
  if (cfg?.useRangoPersonalizado) {
    return {
      inferior: Math.max(0, cfg.margenInferior ?? 0.5),
      superior: Math.max(0, cfg.margenSuperior ?? 0.5),
      personalizado: true,
    };
  }
  const t = toleranciaSetpointDefault(setPoint ?? 0);
  return { inferior: t, superior: t, personalizado: false };
}

export function computeRangoLimites(
  setPoint: number | null | undefined,
  cfg: DeviceAlertConfig | null | undefined
) {
  if (setPoint == null || Number.isNaN(setPoint)) return null;
  const { inferior, superior, personalizado } = getMargenesSetpoint(setPoint, cfg);
  return {
    setPoint,
    margenInferior: inferior,
    margenSuperior: superior,
    min: setPoint - inferior,
    max: setPoint + superior,
    personalizado,
  };
}

export function formatRangoTemperatura(
  setPoint: number | null | undefined,
  cfg: DeviceAlertConfig | null | undefined
): string {
  const rango = computeRangoLimites(setPoint, cfg);
  if (rango == null) return '—';
  const sp = `${rango.setPoint.toFixed(1)} °C`;
  const banda = `${rango.min.toFixed(1)} … ${rango.max.toFixed(1)} °C`;
  const tol =
    rango.margenInferior === rango.margenSuperior
      ? `±${rango.margenInferior} °C`
      : `−${rango.margenInferior}/+${rango.margenSuperior} °C`;
  return rango.personalizado ? `${banda} (SP ${sp}, personalizado)` : `${banda} (SP ${sp}, ${tol})`;
}

function enBandaSetpoint(
  valor: number | null | undefined,
  setPoint: number | null | undefined,
  cfg: DeviceAlertConfig | null | undefined
): boolean | null {
  if (valor == null || Number.isNaN(valor) || setPoint == null || Number.isNaN(setPoint)) {
    return null;
  }
  const { inferior, superior } = getMargenesSetpoint(setPoint, cfg);
  return valor >= setPoint - inferior && valor <= setPoint + superior;
}

/**
 * Con rango personalizado: solo return_air vs banda (defrost → en rango).
 * Sin personalización: delega en en_rango de telemetría.
 */
export function effectiveEnRangoWithConfig(
  dispositivo: DispositivoUltimoEstado,
  cfg: DeviceAlertConfig | null | undefined
): boolean | null {
  if (!cfg?.useRangoPersonalizado) {
    return dispositivo.en_rango;
  }

  if (defrostActivoEfectivo(dispositivo)) return true;

  const setPoint = dispositivo.ultimo_dato?.set_point ?? null;
  const ret = dispositivo.ultimo_dato?.return_air ?? null;
  const retOk = enBandaSetpoint(ret, setPoint, cfg);
  if (retOk === true) return true;
  if (retOk === false) return false;
  return null;
}

export function usaRangoPersonalizado(cfg: DeviceAlertConfig | null | undefined): boolean {
  return Boolean(cfg?.useRangoPersonalizado);
}

/** Estado para columna En rango del listado (OFF tiene prioridad sobre fuera de rango). */
export function evaluarEstadoRangoListado(
  dispositivo: DispositivoUltimoEstado,
  cfg: DeviceAlertConfig | null | undefined
): EstadoRangoListado {
  if (isEquipoApagado(dispositivo) === true) return 'apagado';
  if (isEquipoEncendido(dispositivo) !== true) return 'indeterminado';
  const enRango = effectiveEnRangoWithConfig(dispositivo, cfg);
  if (enRango === true) return 'normal';
  if (enRango === false) return 'fuera';
  return 'indeterminado';
}
