/**
 * Dos ritmos distintos.
 * El chat (prueba, ESTADO, respuestas) espera 4 s y no entra en la cola de alertas.
 * Las alertas siguen a 1 por minuto, en su propio hilo, para no frenar la conversación.
 */
export const TIEMPOS_WA = {
  gapAlertaMs: Number(process.env.OUTBOX_GAP_ALERTA_MS ?? 60_000),
  gapChatMs: Number(process.env.OUTBOX_GAP_CHAT_MS ?? 4_000),
  activoMs: Number(process.env.OUTBOX_ACTIVO_MS ?? 15 * 60_000),
  avisoNoActivoMs: Number(process.env.AVISO_NO_ACTIVO_MS ?? 90_000),
  respuestasRequeridas: Number(process.env.PRUEBA_RESPUESTAS_REQUERIDAS ?? 3),
  tickChatMs: 400,
  tickAlertaMs: 1_000,
};

/** @deprecated usar gapChatMs */
export const gapActivoMs = TIEMPOS_WA.gapChatMs;

/**
 * El chat sale 4 s después del mensaje anterior a ese número.
 * La alerta solo mira su propio cupo de 1 por minuto.
 */
export function proximoEnvio({ ahora, esAlerta, ultimoJid = 0, slotAlerta = 0 }) {
  if (esAlerta) return Math.max(ahora, slotAlerta);
  const previo = ultimoJid > 0 ? ultimoJid + TIEMPOS_WA.gapChatMs : ahora + TIEMPOS_WA.gapChatMs;
  return Math.max(ahora, previo);
}
