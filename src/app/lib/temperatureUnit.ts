/** Unidad de temperatura preferida por usuario. Por defecto Celsius. */
export type TemperaturaUnidad = 'C' | 'F';

export function normalizeTemperaturaUnidad(
  value: unknown
): TemperaturaUnidad {
  const s = String(value ?? 'C').trim().toUpperCase();
  return s === 'F' || s === 'FAHRENHEIT' ? 'F' : 'C';
}

/** Telemetría llega en °C. */
export function celsiusToDisplay(
  celsius: number | null | undefined,
  unit: TemperaturaUnidad
): number | null {
  if (celsius == null || Number.isNaN(celsius)) return null;
  if (unit === 'F') return (celsius * 9) / 5 + 32;
  return celsius;
}

export function formatTemperatura(
  celsius: number | null | undefined,
  unit: TemperaturaUnidad = 'C',
  decimals = 1
): string {
  const v = celsiusToDisplay(celsius, unit);
  if (v == null) return '—';
  return `${v.toFixed(decimals)} °${unit}`;
}

export function unidadSimbolo(unit: TemperaturaUnidad): string {
  return unit === 'F' ? '°F' : '°C';
}

/** Tendencia: valor actual vs el punto anterior en el tiempo (más antiguo). */
export type TempTendencia = 'up' | 'down' | 'flat' | null;

export function tendenciaTemperatura(
  actual: number | null | undefined,
  anterior: number | null | undefined,
  epsilon = 0.05
): TempTendencia {
  if (
    actual == null ||
    anterior == null ||
    Number.isNaN(actual) ||
    Number.isNaN(anterior)
  ) {
    return null;
  }
  const d = actual - anterior;
  if (Math.abs(d) < epsilon) return 'flat';
  return d > 0 ? 'up' : 'down';
}

export function tendenciaLabel(t: TempTendencia): string {
  if (t === 'up') return '↑';
  if (t === 'down') return '↓';
  if (t === 'flat') return '→';
  return '';
}

export function tendenciaTitle(t: TempTendencia): string {
  if (t === 'up') return 'Tendencia al alza';
  if (t === 'down') return 'Tendencia a la baja';
  if (t === 'flat') return 'Sin cambio apreciable';
  return '';
}

/** Respecto al rango: acercarse (↑ verde) o alejarse (↓). */
export type TendenciaRango = 'toward' | 'away' | 'flat' | null;

/**
 * Compara valor actual vs anterior respecto a la banda [min, max].
 * Si la distancia fuera de banda (o al set) baja → toward; si sube → away.
 */
export function tendenciaHaciaRango(
  actual: number | null | undefined,
  anterior: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  setPoint: number | null | undefined,
  epsilon = 0.05
): TendenciaRango {
  if (
    actual == null ||
    anterior == null ||
    Number.isNaN(actual) ||
    Number.isNaN(anterior)
  ) {
    return null;
  }
  const dist = (v: number): number => {
    if (min != null && !Number.isNaN(min) && v < min) return min - v;
    if (max != null && !Number.isNaN(max) && v > max) return v - max;
    if (setPoint != null && !Number.isNaN(setPoint)) return Math.abs(v - setPoint);
    return 0;
  };
  const dAct = dist(actual);
  const dAnt = dist(anterior);
  if (Math.abs(dAct - dAnt) < epsilon) return 'flat';
  return dAct < dAnt ? 'toward' : 'away';
}

export function tendenciaRangoLabel(t: TendenciaRango): string {
  if (t === 'toward') return '↑';
  if (t === 'away') return '↓';
  if (t === 'flat') return '→';
  return '';
}

export function tendenciaRangoTitle(t: TendenciaRango): string {
  if (t === 'toward') return 'Tendencia a volver al rango';
  if (t === 'away') return 'Tendencia a salir de rango';
  if (t === 'flat') return 'Sin cambio apreciable respecto al rango';
  return '';
}

/**
 * Sin muestra anterior: infiere dirección con la comparación suministro vs retorno.
 * Enfriar (supply < return) acerca si el valor está alto; calentar acerca si está bajo.
 */
export function tendenciaRangoPorFlujo(
  valor: number | null | undefined,
  setPoint: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  supply: number | null | undefined,
  returnAir: number | null | undefined,
  epsilon = 0.1
): TendenciaRango {
  if (
    valor == null ||
    setPoint == null ||
    supply == null ||
    returnAir == null ||
    Number.isNaN(valor) ||
    Number.isNaN(setPoint) ||
    Number.isNaN(supply) ||
    Number.isNaN(returnAir)
  ) {
    return null;
  }
  const cooling = returnAir - supply; // >0 el equipo está enfriando
  const lo = min != null && !Number.isNaN(min) ? min : setPoint;
  const hi = max != null && !Number.isNaN(max) ? max : setPoint;

  if (valor > hi + epsilon) {
    if (Math.abs(cooling) < epsilon) return 'flat';
    return cooling > 0 ? 'toward' : 'away';
  }
  if (valor < lo - epsilon) {
    if (Math.abs(cooling) < epsilon) return 'flat';
    return cooling < 0 ? 'toward' : 'away';
  }
  // Dentro de banda: respecto al set
  if (Math.abs(valor - setPoint) < epsilon) return 'flat';
  if (valor > setPoint) {
    if (Math.abs(cooling) < epsilon) return 'flat';
    return cooling > 0 ? 'toward' : 'away';
  }
  if (Math.abs(cooling) < epsilon) return 'flat';
  return cooling < 0 ? 'toward' : 'away';
}
