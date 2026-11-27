import assert from 'node:assert/strict';
import { familiaDeCodigo, identificarNombre, migrarStore } from './deviceNamesRepository.js';
import { preferirEntreStarcool, resumenSenalesStarcool } from './telemetry.js';

assert.equal(familiaDeCodigo('STARCOOL2'), 'STARCOOL');
assert.equal(familiaDeCodigo('STARCOOL'), 'STARCOOL');
assert.equal(familiaDeCodigo('TUNEL'), 'TUNEL');
assert.equal(familiaDeCodigo('THERMOKING'), 'TERMOKING');

const star2 = identificarNombre('STARCOOL2-8600', { imei: '8600', codigo: 'STARCOOL2' });
const star1 = identificarNombre('STARCOOL-8600', { imei: '8600', codigo: 'STARCOOL' });
assert.equal(star2.clave, 'STARCOOL|8600');
assert.equal(star1.clave, star2.clave);
assert.equal(identificarNombre('TUNEL-8600', { imei: '8600', codigo: 'TUNEL' }).clave, 'TUNEL|8600');
assert.notEqual(identificarNombre('TERMOKING-8600', { imei: '8600' }).clave, star2.clave);

const migrado = migrarStore({
  byRowKey: {
    'STARCOOL2-8600': { name: 'REDONDOS', imei: '8600', codigo: 'STARCOOL2', updatedAt: '2026-11-27T10:00:00.000Z' },
    'STARCOOL-8600': { name: 'OTRO', imei: '8600', codigo: 'STARCOOL', updatedAt: '2026-11-26T10:00:00.000Z' },
    'TUNEL-8600': { name: 'TUNEL ROJO', imei: '8600', codigo: 'TUNEL', updatedAt: '2026-11-27T11:00:00.000Z' },
    'TERMOKING-8600': { name: 'TK ROJO', imei: '8600', codigo: 'TERMOKING', updatedAt: '2026-11-27T11:00:00.000Z' },
  },
  byImei: { '8600': 'NO DEBE PISAR' },
  ambiguousImeis: {},
});
assert.equal(migrado.store.byRowKey['STARCOOL|8600'].name, 'REDONDOS');
assert.equal(migrado.store.byRowKey['STARCOOL-8600'].name, 'REDONDOS');
assert.equal(migrado.store.byRowKey['STARCOOL2-8600'].name, 'REDONDOS');
assert.equal(migrado.store.byRowKey['TUNEL|8600'].name, 'TUNEL ROJO');
assert.equal(migrado.store.byRowKey['TERMOKING|8600'].name, 'TK ROJO');
assert.equal(migrado.store.byImei['8600'], undefined);
assert.equal(migrado.eventos.some((e) => e.aplicado && e.nombreAnterior === 'OTRO'), true);
assert.equal(migrado.store.registroVersion, 2);
assert.equal(migrarStore(migrado.store).changed, false);

const viejo = { imei: '1', codigo: 'STARCOOL', ultima_actualizacion: '2026-11-27 08:00:00' };
const nuevo = { imei: '1', codigo: 'STARCOOL2', ultima_actualizacion: '2026-11-27 09:00:00' };
assert.equal(preferirEntreStarcool(viejo, nuevo).codigo, 'STARCOOL2');
assert.equal(preferirEntreStarcool(nuevo, viejo).codigo, 'STARCOOL2');
const resumen = resumenSenalesStarcool([
  viejo,
  nuevo,
  { imei: '1', codigo: 'TUNEL', ultima_actualizacion: '2026-11-27 12:00:00' },
  { imei: '2', codigo: 'STARCOOL2', ultima_actualizacion: '2026-11-27 09:00:00' },
]);
assert.equal(resumen.enAmbas, 1);
assert.equal(resumen.masRecienteStarcool2, 1);
assert.equal(resumen.muestraStarcool2, 1);
assert.equal(resumen.tambienTunel, 1);
assert.equal(resumen.soloStarcool2, 1);

console.log('nombres-equipos ok');
