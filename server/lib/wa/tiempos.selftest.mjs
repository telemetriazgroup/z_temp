import assert from 'node:assert/strict';
import { TIEMPOS_WA, proximoEnvio } from './tiempos.js';

const ahora = 1_000_000;

const alerta = proximoEnvio({
  ahora,
  esAlerta: true,
  chatActivo: true,
  slotAlerta: ahora + 5_000,
});
assert.equal(alerta, ahora + 5_000, 'una alerta espera el cupo de 1 por minuto');

const segunda = proximoEnvio({
  ahora: alerta,
  esAlerta: true,
  chatActivo: false,
  slotAlerta: alerta + TIEMPOS_WA.gapAlertaMs,
});
assert.equal(segunda - alerta, TIEMPOS_WA.gapAlertaMs, 'el segundo destinatario sale 60 s después');

const chat = proximoEnvio({
  ahora,
  esAlerta: false,
  chatActivo: true,
  ultimoJid: ahora - 1_000,
  slotAlerta: ahora + 50_000,
});
assert.equal(chat, ahora - 1_000 + TIEMPOS_WA.gapActivoMs, 'el chat activo no espera el minuto de las alertas');

console.log('tiempos ok', {
  gapAlertaMs: TIEMPOS_WA.gapAlertaMs,
  gapActivoMs: TIEMPOS_WA.gapActivoMs,
  respuestas: TIEMPOS_WA.respuestasRequeridas,
});
