import { evaporadorValido } from './lecturasValidas.js';

/** Evaporador saturado: bajo -35 °C, o al menos 10 °C más frío que el set. Por encima de 99 °C es dato erróneo. */
export function evaporadorSaturado(setPoint, evaporador) {
  const eva = evaporadorValido(evaporador);
  if (eva == null) return false;
  if (eva < -35) return true;
  const set = Number(setPoint);
  if (!Number.isFinite(set)) return false;
  return set - eva >= 10;
}

/** Compresor alto: por encima de 100 °C. Solo Thermoking y TUNEL. */
export function compresorAlto(temp) {
  const n = Number(temp);
  return Number.isFinite(n) && n > 100;
}

export function esTermokingOTunel(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  return c === 'TERMOKING' || c === 'TUNEL' || c === 'THERMOKING';
}

export const HORAS_EVAPORADOR = 3;
export const HORAS_COMPRESOR = 2;
