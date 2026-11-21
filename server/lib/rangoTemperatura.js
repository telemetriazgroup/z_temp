/** Tolerancia por defecto de alertas: ±4 °C respecto al setpoint. */
export const TOLERANCIA_SETPOINT_C = 4;

export function toleranciaSetpointDefault(_setPoint) {
  return TOLERANCIA_SETPOINT_C;
}

/**
 * @param {number | null | undefined} setPoint
 * @param {{ useRangoPersonalizado?: boolean, margenInferior?: number, margenSuperior?: number } | null} rangoOpts
 */
export function getMargenesSetpoint(setPoint, rangoOpts) {
  if (rangoOpts?.useRangoPersonalizado) {
    return {
      inferior: Math.max(0, Number(rangoOpts.margenInferior) || 0.5),
      superior: Math.max(0, Number(rangoOpts.margenSuperior) || 0.5),
    };
  }
  const t = toleranciaSetpointDefault(setPoint);
  return { inferior: t, superior: t };
}

/**
 * @param {number | null | undefined} setPoint
 * @param {{ useRangoPersonalizado?: boolean, margenInferior?: number, margenSuperior?: number } | null} rangoOpts
 */
export function computeRangoLimites(setPoint, rangoOpts) {
  if (setPoint == null || Number.isNaN(setPoint)) return null;
  const { inferior, superior } = getMargenesSetpoint(setPoint, rangoOpts);
  return {
    setPoint,
    margenInferior: inferior,
    margenSuperior: superior,
    min: setPoint - inferior,
    max: setPoint + superior,
    personalizado: Boolean(rangoOpts?.useRangoPersonalizado),
  };
}
