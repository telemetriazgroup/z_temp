import { destinatariosDeAlerta } from './cuenta.js';
import { encolarTexto } from './outbox.js';
import { jidDeTelefono } from './telefono.js';

/**
 * Solo números aprobados (prueba de 3 respuestas o aprobación de un admin).
 * La pausa de 1 minuto entre destinatarios la aplica la cola.
 */
export async function encolarAlertaEquipo({ rowKey, imei, nombre, codigo, texto, grupoWhatsapp = false, emails = [] }) {
  if (!rowKey || !texto) return 0;
  const contactos = await destinatariosDeAlerta({ rowKey, imei, grupoWhatsapp, emails });
  let n = 0;
  for (const c of contactos) {
    const jid = jidDeTelefono(c.telefono);
    if (!jid) continue;
    encolarTexto(jid, texto, {
      esAlerta: true,
      contactoId: c.id,
      telefono: c.telefono,
      tipo: 'alerta',
    });
    n++;
  }
  if (n > 0) {
    console.log(`[wa] alerta ${codigo || ''} ${nombre || rowKey} → ${n} teléfono(s)`);
  }
  return n;
}
