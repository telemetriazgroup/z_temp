import { gapChatMs } from './ajustes.js';

/**
 * Dos ritmos distintos.
 * El chat espera el valor que fija el superadmin (2 s al iniciar, entre 1 y 10).
 * Las alertas siguen a 1 por minuto, en su propio hilo.
 */
export const TIEMPOS_WA = {
  gapAlertaMs: Number(process.env.OUTBOX_GAP_ALERTA_MS ?? 60_000),
  gapChatMs: 2_000,
  activoMs: Number(process.env.OUTBOX_ACTIVO_MS ?? 15 * 60_000),
  avisoNoActivoMs: Number(process.env.AVISO_NO_ACTIVO_MS ?? 90_000),
  respuestasRequeridas: Number(process.env.PRUEBA_RESPUESTAS_REQUERIDAS ?? 3),
  tickChatMs: 400,
  tickAlertaMs: 1_000,
};

/** @deprecated usar gapChatMs */
export const gapActivoMs = TIEMPOS_WA.gapChatMs;

/**
 * Cada respuesta al mismo número espera el intervalo configurado desde ahora
 * o desde el envío ya programado, el que sea más tarde.
 * La alerta solo mira su propio cupo de 1 por minuto.
 */
export function proximoEnvio({ ahora, esAlerta, ultimoJid = 0, slotAlerta = 0, gapMs = gapChatMs() }) {
  if (esAlerta) return Math.max(ahora, slotAlerta);
  const ancla = Math.max(ahora, ultimoJid || 0);
  return ancla + gapMs;
}
