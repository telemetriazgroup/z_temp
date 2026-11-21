import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import {
  listarAsignaciones,
  obtenerContacto,
  obtenerContactoPorTelefono,
  registrarEvento,
  registrarMensaje,
  registrarRespuestaPrueba,
} from './repository.js';
import { encolarTexto, marcarInbound, pendientePorJid } from './outbox.js';
import { jidDeTelefono, telefonoDeJid } from './telefono.js';
import { TIEMPOS_WA } from './tiempos.js';

const CONTACTO_ACTIVACION_NOMBRE = process.env.CONTACTO_ACTIVACION_NOMBRE || 'Luis Marcelo';
const CONTACTO_ACTIVACION_TEL = process.env.CONTACTO_ACTIVACION_TEL || '908947464';

function nombrePila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || '';
}

function intencionDe(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return 'vacio';
  if (/^(ok|listo|visto|dale)\b/.test(t)) return 'ok';
  if (/estado|equipos|menu|menú|hola|ayuda/.test(t)) return 'estado';
  return 'texto';
}

function textosInicio(contacto, equipos) {
  const nombre = nombrePila(contacto.nombre) || 'equipo';
  const n = equipos.length;
  const req = TIEMPOS_WA.respuestasRequeridas;
  const muestra = equipos
    .slice(0, 3)
    .map((e) => e.nombre || e.imei)
    .join(', ');
  return [
    `Hola ${nombre} — soy el monitor ZTRACK.\nAntes de enviarte alarmas necesitamos una conversación corta de activación.`,
    `Tienes *${n}* equipo(s) asignados${muestra ? `. Ahora miraría: *${muestra}*.` : '.'}\nDebes responderme *${req} veces* en este chat para habilitar avisos.`,
    `*Paso 1 de ${req}:* responde *OK* para confirmar que me lees.\nLuego te pediré *ESTADO* y una tercera respuesta. Sin eso no te mandaré alertas.`,
  ];
}

export async function enviarPrueba(contacto) {
  const jid = jidDeTelefono(contacto.telefono);
  const equipos = await listarAsignaciones(contacto.id);
  const partes = textosInicio(contacto, equipos);
  for (const texto of partes) {
    encolarTexto(jid, texto, {
      contactoId: contacto.id,
      telefono: contacto.telefono,
      tipo: 'prueba',
    });
  }
  await registrarEvento(
    contacto.id,
    'prueba_iniciada',
    `Prueba enviada. Se requieren ${TIEMPOS_WA.respuestasRequeridas} respuestas.`
  );
  const contactoId = contacto.id;
  setTimeout(() => {
    recordarSiNoRespondio(contactoId).catch((e) => console.warn('[wa] aviso', e.message));
  }, TIEMPOS_WA.avisoNoActivoMs);
}

async function recordarSiNoRespondio(contactoId) {
  const actual = await obtenerContacto(contactoId);
  if (!actual || actual.alertasHabilitadas || actual.pruebaRespuestas > 0) return;
  const jid = jidDeTelefono(actual.telefono);
  if (!jid || pendientePorJid(jid)) return;
  const nombre = nombrePila(actual.nombre);
  encolarTexto(
    jid,
    `${nombre ? `${nombre}, ` : ''}este chat aún no está activado.\n` +
      `Responde *OK* para seguir la prueba, o coordina con *${CONTACTO_ACTIVACION_NOMBRE}* al *${CONTACTO_ACTIVACION_TEL}*.`,
    { contactoId: actual.id, telefono: actual.telefono, tipo: 'aviso_no_activo' }
  );
}

function textoPaso(contacto) {
  const n = contacto.pruebaRespuestas;
  const req = contacto.pruebaRequeridas || TIEMPOS_WA.respuestasRequeridas;
  const nombre = nombrePila(contacto.nombre);
  if (contacto.alertasHabilitadas) {
    return (
      `Perfecto${nombre ? ` ${nombre}` : ''} — activación *completa* (${req}/${req}).\n` +
      `Desde ahora te enviaré las mismas alertas que salen por correo de tus equipos.\n` +
      `Escribe *ESTADO* cuando quieras ver cómo están.`
    );
  }
  if (n === 1) {
    return (
      `Gracias${nombre ? ` ${nombre}` : ''} — te leí (*1/${req}*).\n` +
      `*Paso 2:* escribe *ESTADO* para ver el resumen de tus equipos.`
    );
  }
  if (n === 2) {
    return (
      `Bien — vamos *2/${req}*.\n` +
      `*Paso 3:* responde *AYUDA* o *OK* para cerrar la activación.`
    );
  }
  return `Recibido (*${n}/${req}*). Faltan ${Math.max(req - n, 0)} respuesta(s) para activar alertas.`;
}

async function resumenEquipos(contacto) {
  const equipos = await listarAsignaciones(contacto.id);
  if (!equipos.length) {
    return 'Todavía no tienes equipos asignados. Cuando te los configuren, escribe *ESTADO*.';
  }
  const flota = await loadCurrentDispositivos().catch(() => []);
  const porKey = new Map(flota.map((d) => [`${d.codigo}-${d.imei}`, d]));
  const lineas = equipos.slice(0, 12).map((e, i) => {
    const d = porKey.get(e.rowKey) || flota.find((x) => x.imei === e.imei);
    const estado = d?.estado_conexion ? String(d.estado_conexion).toUpperCase() : 'SIN DATO';
    const sp = d?.ultimo_dato?.set_point;
    const ret = d?.ultimo_dato?.return_air;
    const temps =
      sp != null || ret != null
        ? ` · set ${sp ?? '—'} · retorno ${ret ?? '—'}`
        : '';
    return `${i + 1}. ${e.nombre || e.imei} · ${e.codigo || '—'} · ${estado}${temps}`;
  });
  return `Estado de tus equipos (${equipos.length})\n${lineas.join('\n')}\nEscribe el IMEI para ver uno.`;
}

async function detalleEquipo(contacto, texto) {
  const equipos = await listarAsignaciones(contacto.id);
  const q = String(texto).replace(/\D/g, '');
  if (q.length < 5) return null;
  const e = equipos.find((x) => String(x.imei).includes(q));
  if (!e) return null;
  const flota = await loadCurrentDispositivos().catch(() => []);
  const d = flota.find((x) => x.imei === e.imei && (!e.codigo || x.codigo === e.codigo));
  if (!d) return `${e.nombre || e.imei}: sin telemetría reciente en la flota.`;
  const u = d.ultimo_dato ?? {};
  return (
    `${e.nombre || e.imei}\n` +
    `${d.codigo || '—'} · ${String(d.estado_conexion || '—').toUpperCase()}\n` +
    `Set ${u.set_point ?? '—'} °C · retorno ${u.return_air ?? '—'} · suministro ${u.temp_supply_1 ?? '—'}\n` +
    `Última conexión: ${d.ultima_actualizacion || '—'}`
  );
}

export async function recibirMensaje({ jid, telefono, texto }) {
  marcarInbound(jid);
  const tel = telefono || telefonoDeJid(jid);
  const contacto = await obtenerContactoPorTelefono(tel);
  await registrarMensaje({
    contactoId: contacto?.id,
    telefono: tel,
    direccion: 'in',
    texto,
    tipo: 'chat',
  }).catch(() => {});

  if (!contacto || !contacto.activo) return { ignorado: true };

  const intencion = intencionDe(texto);

  if (contacto.pruebaIniciadaEn && !contacto.alertasHabilitadas) {
    const actualizado = await registrarRespuestaPrueba(contacto.id);
    await registrarEvento(
      contacto.id,
      'respuesta_prueba',
      `Respuesta ${actualizado.pruebaRespuestas}/${actualizado.pruebaRequeridas}: ${String(texto).slice(0, 120)}`
    );
    encolarTexto(jid, textoPaso(actualizado), {
      contactoId: actualizado.id,
      telefono: actualizado.telefono,
      tipo: 'prueba',
    });
    if (intencion === 'estado') {
      const resumen = await resumenEquipos(actualizado);
      encolarTexto(jid, resumen, {
        contactoId: actualizado.id,
        telefono: actualizado.telefono,
        tipo: 'estado',
      });
    }
    return { prueba: true, contacto: actualizado };
  }

  if (!contacto.alertasHabilitadas) {
    encolarTexto(
      jid,
      `${nombrePila(contacto.nombre) || 'Hola'}, este número aún no está activado. ` +
        `Cuando te llegue la prueba de sincronización, respóndela para habilitar las alertas.`,
      { contactoId: contacto.id, telefono: contacto.telefono, tipo: 'no_activo' }
    );
    return { noActivo: true };
  }

  const detalle = await detalleEquipo(contacto, texto);
  if (detalle) {
    encolarTexto(jid, detalle, {
      contactoId: contacto.id,
      telefono: contacto.telefono,
      tipo: 'estado',
    });
    return { estado: true };
  }

  if (intencion === 'estado' || intencion === 'ok' || intencion === 'texto') {
    const resumen = await resumenEquipos(contacto);
    encolarTexto(jid, resumen, {
      contactoId: contacto.id,
      telefono: contacto.telefono,
      tipo: 'estado',
    });
  }
  return { estado: true, contacto };
}
