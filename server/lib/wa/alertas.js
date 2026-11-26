import { readJson, writeJson } from '../store.js';
import { destinatariosDeAlerta } from './cuenta.js';
import { enVentanaAlertaGrupo } from './gruposAlerta.js';
import { encolarTexto } from './outbox.js';
import { idsSilenciados, obtenerContactoPorTelefono, reclamarPrimeraAlerta } from './repository.js';
import { jidDeTelefono, normalizarTelefono } from './telefono.js';

const PENDIENTES = 'wa_pendientes.json';
const recientes = new Map();

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

function yaReciente(clave) {
  const previo = recientes.get(clave) || 0;
  if (Date.now() - previo < 15 * 60 * 1000) return true;
  recientes.set(clave, Date.now());
  return false;
}

function leerPendientes() {
  const raw = readJson(PENDIENTES, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/**
 * Alerta automática al número individual.
 * De 05:00 a 22:00 (hora Perú) sale en el momento. Fuera de ese horario se guarda
 * la última y se manda una sola vez al abrir la ventana, sin repetir la noche.
 */
export async function publicarAlertaIndividual(clave, payload) {
  if (!payload?.texto || !payload?.rowKey) return 0;
  if (!enVentanaAlertaGrupo()) {
    const all = leerPendientes();
    all[clave] = { ...payload, savedAt: new Date().toISOString() };
    const claves = Object.keys(all);
    if (claves.length > 80) {
      claves.sort((a, b) => String(all[a]?.savedAt || '').localeCompare(String(all[b]?.savedAt || '')));
      for (const k of claves.slice(0, claves.length - 80)) delete all[k];
    }
    writeJson(PENDIENTES, all);
    return 0;
  }
  const all = leerPendientes();
  if (all[clave]) {
    delete all[clave];
    writeJson(PENDIENTES, all);
  }
  if (yaReciente(clave)) return 0;
  return encolarAlertaEquipo(payload);
}

export async function drenarPendientesWhatsapp() {
  if (!enVentanaAlertaGrupo()) return 0;
  const all = leerPendientes();
  const claves = Object.keys(all);
  if (!claves.length) return 0;
  writeJson(PENDIENTES, {});
  let n = 0;
  for (const clave of claves) {
    const payload = all[clave];
    if (!payload?.texto || !payload?.rowKey) continue;
    if (yaReciente(clave)) continue;
    n += await encolarAlertaEquipo(payload);
  }
  return n;
}
