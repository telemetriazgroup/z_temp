import assert from 'node:assert/strict';
import { TIEMPOS_WA, proximoEnvio } from './tiempos.js';

const ahora = 1_000_000;

const alerta = proximoEnvio({
  ahora,
  esAlerta: true,
  slotAlerta: ahora + 5_000,
});
assert.equal(alerta, ahora + 5_000, 'una alerta espera su propio cupo');

const segunda = proximoEnvio({
  ahora: alerta,
  esAlerta: true,
  slotAlerta: alerta + TIEMPOS_WA.gapAlertaMs,
});
assert.equal(segunda - alerta, TIEMPOS_WA.gapAlertaMs, 'el segundo destinatario de alerta sale 60 s después');

const respuesta = proximoEnvio({
  ahora,
  esAlerta: false,
  ultimoJid: 0,
  slotAlerta: ahora + 50_000,
  gapMs: 2_000,
});
assert.equal(respuesta, ahora + 2_000, 'la respuesta espera 2 s y no el minuto de la alerta');

const siguiente = proximoEnvio({
  ahora: respuesta,
  esAlerta: false,
  ultimoJid: respuesta,
  slotAlerta: ahora + 50_000,
  gapMs: 2_000,
});
assert.equal(siguiente - respuesta, 2_000, 'el siguiente mensaje del mismo chat sale 2 s después');

const trasPausa = proximoEnvio({
  ahora,
  esAlerta: false,
  ultimoJid: ahora - 60_000,
  gapMs: 2_000,
});
assert.equal(trasPausa, ahora + 2_000, 'aunque el anterior salió hace rato, la nueva respuesta espera 2 s');
assert.equal(TIEMPOS_WA.gapChatMs, 2_000);

console.log('tiempos ok', { gapAlertaMs: TIEMPOS_WA.gapAlertaMs, gapChatMs: TIEMPOS_WA.gapChatMs });
