import assert from 'node:assert/strict';
import { decisionDeAlerta, marcaCobertura } from './cobertura.js';
import { textoCoberturaInestable } from './cobertura.js';

const ahora = new Date('2026-11-27T16:39:00.000Z');
const viejo = new Date(ahora.getTime() - 22 * 3600000).toISOString();
const fresco = new Date(ahora.getTime() - 5 * 60000).toISOString();

const waitLargo = marcaCobertura({ estado_conexion: 'wait', ultima_actualizacion: viejo, minutos_desde_ultimo_dato: 22 * 60 }, ahora);
assert.equal(waitLargo.inestable, true);

const waitCorto = marcaCobertura({ estado_conexion: 'wait', ultima_actualizacion: fresco, minutos_desde_ultimo_dato: 5 }, ahora);
assert.equal(waitCorto.inestable, false);

const online = marcaCobertura({ estado_conexion: 'online', ultima_actualizacion: fresco, minutos_desde_ultimo_dato: 2 }, ahora);
assert.equal(online.inestable, false);

const offlineCorto = marcaCobertura({ estado_conexion: 'offline', ultima_actualizacion: fresco, minutos_desde_ultimo_dato: 10 }, ahora);
assert.equal(offlineCorto.inestable, false);

const justo = marcaCobertura({ estado_conexion: 'wait', ultima_actualizacion: new Date(ahora.getTime() - 2 * 3600000).toISOString(), minutos_desde_ultimo_dato: 120 }, ahora);
assert.equal(justo.inestable, false);

const pasa = marcaCobertura({ estado_conexion: 'wait', ultima_actualizacion: new Date(ahora.getTime() - (2 * 60 + 1) * 60000).toISOString(), minutos_desde_ultimo_dato: 121 }, ahora);
assert.equal(pasa.inestable, true);

const texto = textoCoberturaInestable(viejo, ahora);
assert.equal(texto.toLowerCase().includes('cobertura inestable'), true);
assert.equal(texto.toLowerCase().includes('todo está normal'), false);
assert.equal(texto.toLowerCase().includes('información actualizada'), true);

const pronto = decisionDeAlerta({ condicion: 'fuera_linea', horas: 2.4, umbral: 3, enVentana: true, yaEnviado: false, suspendida: false });
assert.equal(pronto.enviar, false);
assert.equal(pronto.pronto, true);

const listo = decisionDeAlerta({ condicion: 'fuera_linea', horas: 22, umbral: 3, enVentana: true, yaEnviado: false, suspendida: false });
assert.equal(listo.enviar, true);

const normal = decisionDeAlerta({ condicion: null, horas: 0, umbral: 3, enVentana: true, yaEnviado: false, suspendida: false });
assert.equal(normal.enviar, false);
assert.equal(normal.motivo.includes('Sin condición'), true);

console.log('cobertura ok');
