import assert from 'node:assert/strict';
import { ordenAlerta, autorPuedeCambiarAlertas } from './gruposAlerta.js';

assert.deepEqual(ordenAlerta('desactivar alertas en ZGRU1020203'), {
  accion: 'desactivar',
  zgru: 'ZGRU1020203',
});
assert.deepEqual(ordenAlerta('@asistente activar alertas en zgru 1186255'), {
  accion: 'activar',
  zgru: 'ZGRU1186255',
});
assert.deepEqual(ordenAlerta('desactivar alertas'), { accion: 'desactivar', zgru: '' });
assert.deepEqual(ordenAlerta('activa alertas en ZGRU1020203'), { accion: 'activar', zgru: 'ZGRU1020203' });
assert.equal(ordenAlerta('quiero la grafica de ZGRU1020203'), null);
assert.equal(ordenAlerta('ver alertas de ZGRU1020203'), null);

const cfg = {
  autorizadosAlertas: ['51987654321@c.us'],
  participantes: [{ jid: '51987654321@c.us', numero: '51987654321' }],
};
assert.equal(autorPuedeCambiarAlertas(cfg, '51987654321@c.us', ''), true);
assert.equal(autorPuedeCambiarAlertas(cfg, '12345@lid', '51987654321'), true);
assert.equal(autorPuedeCambiarAlertas(cfg, '51911111111@c.us', '51911111111'), false);
assert.equal(autorPuedeCambiarAlertas({ autorizadosAlertas: [] }, '51987654321@c.us', ''), false);

console.log('orden-alerta ok');
