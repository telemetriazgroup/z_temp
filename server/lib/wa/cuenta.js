import { getUsers, updateOwnProfile } from '../usersRepository.js';
import { resolveUserEffectiveImeis } from '../gruposEquiposRepository.js';
import {
  aprobarManual,
  contactosAprobadosPorUsernames,
  contactosParaAlerta,
  contactosPorTelefonos,
  idsSilenciados,
  vincularNumeroDeUsuario,
} from './repository.js';

function esCliente(user) {
  if (!user) return false;
  if (user.superUser === true || user.category === 'superadmin' || user.category === 'admin') {
    return false;
  }
  return true;
}

/**
 * Números que deben recibir la alerta de un equipo.
 *
 * 1) Cuenta ZTRACK: si el IMEI está en deviceAccess/grupos de la cuenta
 *    y esa cuenta tiene WhatsApp vinculado + prueba aprobada.
 * 2) Grupo de correo: si el grupo tiene WhatsApp activo, suma contactos
 *    cuyo correo de usuario está en los destinatarios del grupo.
 *
 * Consulta de estado/gráfica en chat NO usa el grupo de correo: solo la
 * flota de la cuenta ligada al número (ver equiposCuenta.js).
 *
 * En ambos casos el número tiene que estar aprobado y no silenciado.
 */
export async function destinatariosDeAlerta({
  rowKey,
  imei,
  grupoWhatsapp = false,
  emails = [],
  whatsappNumeros = [],
}) {
  const vistos = new Map();
  const sumar = (lista) => {
    for (const c of lista) {
      if (!c?.telefono || !c.alertasHabilitadas || c.alertasPausadas) continue;
      vistos.set(c.telefono, c);
    }
  };

  sumar(await contactosParaAlerta(rowKey));

  const usernames = [];
  for (const user of getUsers()) {
    if (!esCliente(user)) continue;
    const imeis = resolveUserEffectiveImeis(user);
    if (imeis == null || !imei || !imeis.includes(String(imei))) continue;
    usernames.push(user.username);
  }
  if (grupoWhatsapp) {
    const correos = new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean));
    for (const user of getUsers()) {
      const correo = String(user.correo || '').trim().toLowerCase();
      if (correo && correos.has(correo)) usernames.push(user.username);
    }
    sumar(await contactosPorTelefonos(whatsappNumeros));
  }
  sumar(await contactosAprobadosPorUsernames(usernames));

  const ids = [...vistos.values()].map((c) => c.id);
  const mudos = await idsSilenciados(ids, rowKey);
  return [...vistos.values()].filter((c) => !mudos.has(c.id));
}

export async function sincronizarNumeroUsuario(user, { aprobar = false } = {}) {
  const contacto = await vincularNumeroDeUsuario({
    username: user.username,
    nombre: user.displayName || user.nombres || user.username,
    telefono: user.whatsappNumero || '',
  });
  if (aprobar && contacto) return aprobarManual(contacto.id);
  return contacto;
}

export function guardarNumeroPropio(actor, numero) {
  return updateOwnProfile(actor.id, { whatsappNumero: numero ?? '' }, actor.username);
}
