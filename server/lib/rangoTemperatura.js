/** Tolerancia por defecto: ±10 % del |setpoint| (mín. 0,5 °C si setpoint = 0). */
export function toleranciaSetpointDefault(setPoint) {
  if (setPoint === 0 || Number.isNaN(setPoint)) return 0.5;
  return Math.abs(setPoint) * 0.1;
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
