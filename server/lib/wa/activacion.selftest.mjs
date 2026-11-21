import assert from 'node:assert/strict';
import { ensureWaSchema } from './schema.js';
import {
  contactosParaAlerta,
  eliminarContacto,
  guardarContacto,
  iniciarPrueba,
  registrarRespuestaPrueba,
  reemplazarAsignaciones,
} from './repository.js';

await ensureWaSchema();
const contacto = await guardarContacto({
  nombre: 'Prueba activacion',
  telefono: '519000000099',
});
await reemplazarAsignaciones(contacto.id, [
  { rowKey: 'TEST-000', imei: '000', codigo: 'TEST', nombre: 'Equipo de prueba' },
]);

const antes = await contactosParaAlerta('TEST-000');
assert.equal(antes.length, 0, 'sin aprobar no hay destinatarios');

await iniciarPrueba(contacto.id);
let paso = await registrarRespuestaPrueba(contacto.id);
assert.equal(paso.pruebaRespuestas, 1);
assert.equal(paso.alertasHabilitadas, false);
paso = await registrarRespuestaPrueba(contacto.id);
assert.equal(paso.pruebaRespuestas, 2);
assert.equal(paso.alertasHabilitadas, false);
paso = await registrarRespuestaPrueba(contacto.id);
assert.equal(paso.pruebaRespuestas, 3);
assert.equal(paso.alertasHabilitadas, true);

const despues = await contactosParaAlerta('TEST-000');
assert.equal(despues.length, 1, 'aprobado sí recibe la alerta del equipo');

await eliminarContacto(contacto.id);
const limpio = await contactosParaAlerta('TEST-000');
assert.equal(limpio.length, 0);
console.log('activacion ok');
process.exit(0);
