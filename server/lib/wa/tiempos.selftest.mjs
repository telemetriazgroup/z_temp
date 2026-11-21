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

const respuesta = proximoEnvio({ ahora, esAlerta: false, ultimoJid: 0, slotAlerta: ahora + 50_000 });
assert.equal(respuesta, ahora + TIEMPOS_WA.gapChatMs, 'la respuesta espera 4 s y no el minuto de la alerta');

const siguiente = proximoEnvio({
  ahora: respuesta,
  esAlerta: false,
  ultimoJid: respuesta,
  slotAlerta: ahora + 50_000,
});
assert.equal(siguiente - respuesta, TIEMPOS_WA.gapChatMs, 'el siguiente mensaje del mismo chat sale 4 s después');
assert.equal(TIEMPOS_WA.gapChatMs, 4_000);

console.log('tiempos ok', { gapAlertaMs: TIEMPOS_WA.gapAlertaMs, gapChatMs: TIEMPOS_WA.gapChatMs });
