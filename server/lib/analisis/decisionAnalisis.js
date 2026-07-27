/**
 * Texto de auditoría (campo `analisis`, solo admin) con la lógica de cada decisión.
 */

import {
  MIN_APAGADO_MS,
  MIN_FUERA_RANGO_MS,
  SUMINISTRO_CERCA_SETPOINT_C,
} from './rango.js';

function minLabel(ms) {
  return Math.round(ms / 60000);
}

/** @param {object} [metrics] métricas de evaluateDefrostShape / patrón */
export function formatDefrostAnalisis(metrics = {}) {
  const lines = [
    'Decisión: DEFROST (no se cuenta como fuera de rango).',
    'Lógica: el evaporador muestra ciclo de deshielo (valle → pico categórico → bajada al reanudar enfriamiento), no un desvío sostenido de la banda.',
  ];
  if (metrics.maxEvap != null) {
    lines.push(`• Pico evaporador: ${metrics.maxEvap} °C`);
  }
  if (metrics.overRet != null) {
    lines.push(`• Separación vs retorno: +${metrics.overRet} °C (umbral ≥ 4 °C)`);
  }
  if (metrics.overSupply != null) {
    lines.push(
      `• Separación vs suministro: +${metrics.overSupply} °C (umbral ≥ 8 °C)`
    );
  }
  if (metrics.riseFromDip != null) {
    lines.push(`• Subida desde valle: ${metrics.riseFromDip} °C (umbral ≥ 8 °C)`);
  }
  if (metrics.dropAfter != null) {
    const delay =
      metrics.dropDelayMin != null ? ` en ${metrics.dropDelayMin} min` : '';
    lines.push(
      `• Bajada post-pico: ${metrics.dropAfter} °C${delay} (umbral ≥ 3 °C en ≤ 5 min)`
    );
  }
  if (metrics.durationMin != null) {
    lines.push(
      `• Duración del tramo: ${metrics.durationMin} min (máx. 60 min para auto-DEFROST)`
    );
  }
  lines.push(
    'Por eso no es fuera de rango: el calentamiento es del evaporador por resistencia de deshielo, no un fallo de control de la banda.'
  );
  return lines.join('\n');
}

export function analisisApagadoReal(durationMinutes) {
  return [
    'Decisión: APAGADO real.',
    `Lógica: power_state = 0 durante ≥ ${minLabel(MIN_APAGADO_MS)} min.`,
    `• Duración: ${durationMinutes ?? '—'} min`,
    `• Suministro no estaba a ≤ ${SUMINISTRO_CERCA_SETPOINT_C} °C del set point (si lo estuviera sería falso apagado).`,
    'Durante apagado no se cuenta fuera de rango en la misma franja (prioridad apagado).',
  ].join('\n');
}

export function analisisFalsoApagadoDuracion(durationMinutes) {
  return [
    'Decisión: FALSO APAGADO (no operativo / no se muestra al cliente).',
    `Lógica: power_state = 0 pero duración < ${minLabel(MIN_APAGADO_MS)} min (ruido / transitorio).`,
    `• Duración: ${durationMinutes ?? '—'} min`,
  ].join('\n');
}

export function analisisFalsoApagadoSuministro() {
  return [
    'Decisión: FALSO APAGADO (no operativo / no se muestra al cliente).',
    'Lógica: power_state = 0 pero el suministro se mantiene cerca del set point:',
    `• |suministro − set_point| ≤ ${SUMINISTRO_CERCA_SETPOINT_C} °C → el equipo sigue refrigerando; el flag de apagado no es confiable.`,
  ].join('\n');
}

export function analisisFueraRango(opts = {}) {
  const lines = [
    'Decisión: FUERA DE RANGO.',
    `Lógica: episodio continuo de return_air fuera de la banda programada (límites inclusivos) durante ≥ ${minLabel(MIN_FUERA_RANGO_MS)} min.`,
    '• Inicio: primer punto con retorno fuera de banda (ej. banda −10…5 → 6.5 inicia).',
    '• Fin: primer punto que vuelve a estar dentro (ej. 4.9 cierra). Los valores dentro (4.7) no abren evento.',
  ];
  if (opts.recortadoPorApagadoOSinTx) {
    lines.push(
      '• Intervalo recortado: no se solapa con apagado ni con huecos sin transmisión (sin datos no se afirma fuera de rango).'
    );
  }
  if (opts.partidoPorDefrost) {
    lines.push(
      '• Se extrajo un tramo DEFROST intermedio; este remanente es el fuera de rango real (antes/después del deshielo).'
    );
  }
  lines.push(
    'No es DEFROST: no cumple valle→pico categórico del evaporador con bajada en ≤ 5 min (o el evaporador quedó en meseta sin pendiente de enfriamiento).'
  );
  return lines.join('\n');
}

export function analisisFalsoFuera(durationMinutes, extraNote) {
  const lines = [
    'Decisión: FUERA CORTO / descartado (no operativo / no se muestra al cliente).',
    `Lógica: episodio fuera de banda < ${minLabel(MIN_FUERA_RANGO_MS)} min (transitorio).`,
    `• Duración: ${durationMinutes ?? '—'} min`,
  ];
  if (extraNote) lines.push(`• ${extraNote}`);
  return lines.join('\n');
}

export function analisisSinTransmision(durationHours) {
  return [
    'Decisión: SIN TRANSMISIÓN DE DATOS (solo admin).',
    'Lógica: hueco entre muestras consecutivas > 2 h.',
    `• Duración del hueco: ${durationHours ?? '—'} h`,
    'En ese lapso no se afirma fuera de rango (no hay telemetría). El cliente no ve este evento.',
  ].join('\n');
}
