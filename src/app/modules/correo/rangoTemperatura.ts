import type { DeviceAlertConfig } from './types';
import type { DispositivoUltimoEstado } from '../../types';

export function toleranciaSetpointDefault(setPoint: number): number {
  if (setPoint === 0 || Number.isNaN(setPoint)) return 0.5;
  return Math.abs(setPoint) * 0.1;
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
  const t = setPoint != null && !Number.isNaN(setPoint) ? toleranciaSetpointDefault(setPoint) : 0.5;
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
  return rango.personalizado ? `${banda} (SP ${sp}, personalizado)` : `${banda} (SP ${sp}, ±10 %)`;
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
 * Misma lógica que el servidor (`historicalTelemetry.effectiveEnRangoFromDispositivo`).
 * Si `cfg.useRangoPersonalizado`, usa márgenes del equipo; si no, delega en `en_rango` de telemetría.
 */
export function effectiveEnRangoWithConfig(
  dispositivo: DispositivoUltimoEstado,
  cfg: DeviceAlertConfig | null | undefined
): boolean | null {
  if (!cfg?.useRangoPersonalizado) {
    return dispositivo.en_rango;
  }

  if (dispositivo.en_defrost === true) return true;
  if (dispositivo.en_rango === true) return true;

  const d = dispositivo.ultimo_dato ?? {};
  const setPoint = d.set_point ?? null;
  const sup = d.temp_supply_1 ?? null;
  const ret = d.return_air ?? null;

  if (setPoint != null && sup != null && enBandaSetpoint(sup, setPoint, cfg) === true) {
    return true;
  }

  if (dispositivo.en_rango === false) return false;

  const supOk = enBandaSetpoint(sup, setPoint, cfg);
  const retOk = enBandaSetpoint(ret, setPoint, cfg);
  if (supOk === false || retOk === false) return false;
  if (supOk === true && retOk === true) return true;
  return null;
}

export function usaRangoPersonalizado(cfg: DeviceAlertConfig | null | undefined): boolean {
  return Boolean(cfg?.useRangoPersonalizado);
}
