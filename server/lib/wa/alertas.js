import { destinatariosDeAlerta } from './cuenta.js';
import { encolarTexto } from './outbox.js';
import { idsSilenciados, obtenerContactoPorTelefono, reclamarPrimeraAlerta } from './repository.js';
import { jidDeTelefono, normalizarTelefono } from './telefono.js';

const PIE_PRIMERA =
  '\n\nEsta es la *primera alerta*. Respóndeme cualquier mensaje para seguir recibiendo avisos, de a uno cada minuto.' +
  '\nEscribe *resumen* para ver fuera de rango más de 1 h y fuera de línea más de 2 h.' +
  '\n*menu* abre el detalle de cada equipo.';

/**
 * Números ya confirmados reciben cada aviso, con una alerta por minuto en ese teléfono.
 * Un número que el superadmin acaba de habilitar recibe solo la primera.
 * Las demás esperan a que ese número conteste.
 */
export async function encolarAlertaEquipo({
  rowKey,
  imei,
  nombre,
  codigo,
  texto,
  grupoWhatsapp = false,
  emails = [],
  whatsappNumeros = [],
}) {
  if (!rowKey || !texto) return 0;
  const contactos = await destinatariosDeAlerta({ rowKey, imei, grupoWhatsapp, emails, whatsappNumeros });
  let n = 0;
  const ya = new Set(contactos.map((c) => c.telefono));
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
  if (grupoWhatsapp) {
    for (const item of whatsappNumeros) {
      const tel = normalizarTelefono(item?.telefono ?? item);
      if (!tel || ya.has(tel)) continue;
      const previo = await obtenerContactoPorTelefono(tel);
      if (!previo?.consultaLibre || previo.alertasHabilitadas || previo.alertasPausadas || !previo.activo) {
        continue;
      }
      const mudos = await idsSilenciados([previo.id], rowKey);
      if (mudos.has(previo.id)) continue;
      const primera = await reclamarPrimeraAlerta(tel);
      if (!primera) continue;
      const jid = jidDeTelefono(primera.telefono);
      if (!jid) continue;
      encolarTexto(jid, `${texto}${PIE_PRIMERA}`, {
        esAlerta: true,
        contactoId: primera.id,
        telefono: primera.telefono,
        tipo: 'alerta',
      });
      n++;
    }
  }
  if (n > 0) {
    console.log(`[wa] alerta ${codigo || ''} ${nombre || rowKey} → ${n} teléfono(s)`);
  }
  return n;
}
