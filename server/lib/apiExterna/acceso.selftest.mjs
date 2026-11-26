import assert from 'node:assert/strict';
import { ipPermitida } from './acceso.js';
import { origenCanonico, marcaDe, ventanaHistorial, serieHistorial } from './presentar.js';
import { hashClave, normalizarIps, calcularVencimiento, estadoDemo } from './repositorio.js';

assert.equal(ipPermitida('190.12.10.4', []), true);
assert.equal(ipPermitida('190.12.10.4', ['190.12.10.4']), true);
assert.equal(ipPermitida('190.12.10.5', ['190.12.10.4']), false);
assert.equal(ipPermitida('190.12.10.20', ['190.12.10.0/24']), true);
assert.equal(ipPermitida('10.0.0.1', ['190.12.10.0/24']), false);

assert.equal(origenCanonico('thermoking'), 'TERMOKING');
assert.equal(origenCanonico('STARCOOL2'), 'STARCOOL2');
assert.equal(origenCanonico('otro'), null);
assert.equal(marcaDe('TUNEL'), 'Thermoking');
assert.equal(marcaDe('STARCOOL'), 'StarCool');

const ahora = new Date('2026-11-26T21:00:00.000Z');
const ventana = ventanaHistorial({ horas: 12 }, ahora);
assert.equal(ventana.hasta.toISOString(), ahora.toISOString());
assert.equal(ventana.desde.toISOString(), '2026-11-26T09:00:00.000Z');
assert.throws(() => ventanaHistorial({ horas: 1, desde: '2026-11-01 00:00', hasta: '2026-11-20 00:00' }));

const serie = serieHistorial(
  [
    { created_at: '2026-11-26T16:10:00', return_air: -18.2, set_point: -20, temp_supply_1: -19 },
    { created_at: '2026-11-26T16:20:00', return_air: -18.4, set_point: -20, temp_supply_1: -19.1 },
  ],
  'TUNEL'
);
assert.equal(serie.puntos.length, 2);
assert.equal(serie.puntos[0].fecha_lima, '2026-11-26 16:10');
assert.equal(serie.puntos[0].retorno, -18.2);
assert.equal(serie.puntos[0].suministro, -19);
assert.equal(serie.recortado, false);

assert.equal(hashClave('ztk_demo').length, 64);
assert.deepEqual(normalizarIps('190.12.10.4\n190.12.10.0/24'), ['190.12.10.4', '190.12.10.0/24']);
assert.throws(() => normalizarIps(['no-es-ip']));

const inicio = new Date('2026-11-26T15:00:00.000Z');
assert.equal(calcularVencimiento(6, 'horas', inicio).toISOString(), '2026-11-26T21:00:00.000Z');
assert.equal(calcularVencimiento(2, 'dias', inicio).toISOString(), '2026-11-28T15:00:00.000Z');
assert.throws(() => calcularVencimiento(0, 'horas', inicio));
assert.throws(() => calcularVencimiento(31, 'dias', inicio));
assert.equal(
  estadoDemo({ keyHash: 'x', revocada: false, venceEn: '2026-11-26T21:00:00.000Z' }, inicio),
  'vigente'
);
assert.equal(
  estadoDemo({ keyHash: 'x', revocada: false, venceEn: '2026-11-26T15:00:00.000Z' }, inicio),
  'vencida'
);
assert.equal(estadoDemo({ keyHash: null, venceEn: '2026-11-27T15:00:00.000Z' }, inicio), 'revocada');

console.log('api-externa ok');
