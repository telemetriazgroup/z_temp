/**
 * Ritmo de salida, el mismo criterio con el que se construyó zgroup-bot:
 * una alerta nueva por minuto entre destinatarios, y respuestas al chat
 * activo como máximo cada 10 s. El aviso a un número aún no activado espera 90 s.
 */
export const TIEMPOS_WA = {
  gapAlertaMs: Number(process.env.OUTBOX_GAP_ALERTA_MS ?? 60_000),
  gapActivoMs: Number(process.env.OUTBOX_GAP_ACTIVO_MS ?? 10_000),
  activoMs: Number(process.env.OUTBOX_ACTIVO_MS ?? 15 * 60_000),
  avisoNoActivoMs: Number(process.env.AVISO_NO_ACTIVO_MS ?? 90_000),
  respuestasRequeridas: Number(process.env.PRUEBA_RESPUESTAS_REQUERIDAS ?? 3),
  tickMs: 2_000,
};

/**
 * Calcula cuándo puede salir el próximo mensaje.
 * Las alertas no se adelantan al chat activo: van en su propio cupo de 1/min.
 */
export function proximoEnvio({
  ahora,
  esAlerta,
  chatActivo,
  ultimoJid = 0,
  slotAlerta = 0,
  slotConversacion = 0,
}) {
  const t = TIEMPOS_WA;
  if (esAlerta) {
    return Math.max(ahora, slotAlerta);
  }
  if (chatActivo) {
    return Math.max(ahora, ultimoJid + t.gapActivoMs);
  }
  return Math.max(ahora, slotConversacion);
}

export function avanzarSlot(envioEn, esAlerta) {
  const paso = esAlerta ? TIEMPOS_WA.gapAlertaMs : TIEMPOS_WA.gapAlertaMs;
  return envioEn + paso;
}
