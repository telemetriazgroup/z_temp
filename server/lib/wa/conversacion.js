import {
  obtenerContacto,
  obtenerContactoPorTelefono,
  registrarEvento,
  registrarMensaje,
  registrarRespuestaPrueba,
} from './repository.js';
import { encolarTexto, marcarInbound, pendientePorJid } from './outbox.js';
import { jidDeTelefono, telefonoDeJid } from './telefono.js';
import { TIEMPOS_WA } from './tiempos.js';
import {
  equiposEfectivosDeContacto,
  equiposOrganizadosDeContacto,
  filtrarEquipos,
  etiqueta,
} from './equiposCuenta.js';

const CONTACTO_ACTIVACION_NOMBRE = process.env.CONTACTO_ACTIVACION_NOMBRE || 'Luis Marcelo';
const CONTACTO_ACTIVACION_TEL = process.env.CONTACTO_ACTIVACION_TEL || '908947464';
const PAGE_SIZE = 8;

/** @type {Map<string, object>} */
const ctxChat = new Map();

function getCtx(jid) {
  return ctxChat.get(jid) || {};
}

function setCtx(jid, patch) {
  const next = { ...getCtx(jid), ...patch, at: Date.now() };
  ctxChat.set(jid, next);
  return next;
}

function nombrePila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || '';
}

function intencionDe(texto) {
  const t = String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!t) return 'vacio';
  if (/^(ok|listo|visto|dale|gracias)\b/.test(t)) return 'ok';
  if (/^(limpiar|sin filtro|quitar filtro)$/.test(t)) return 'limpiar';
  if (/^(anterior|atras|volver)$/.test(t)) return 'anterior';
  if (/^(ver mas|vermás|siguiente)$/.test(t)) return 'ver_mas';
  if (/^(todos|todas|menu|inicio)$/.test(t)) return 'todos';
  if (/^(buscar|filtro|filtrar|busca)\s+/.test(t)) return 'buscar';
  if (/estado|equipos|menu|menú|hola|ayuda/.test(t)) return 'estado';
  if (/^\d{1,2}$/.test(t)) return 'opcion';
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
    `Tienes *${n}* equipo(s) en tu cuenta` +
      (muestra ? `. Ahora miraría: *${muestra}*.` : '.') +
      `\nDebes responderme *${req} veces* en este chat para habilitar avisos.`,
    `*Paso 1 de ${req}:* responde *OK* para confirmar que me lees.\nLuego te pediré *ESTADO* y una tercera respuesta. Sin eso no te mandaré alertas.`,
  ];
}

export async function enviarPrueba(contacto) {
  const jid = jidDeTelefono(contacto.telefono);
  const equipos = await equiposEfectivosDeContacto(contacto);
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
    `Prueba enviada. Se requieren ${TIEMPOS_WA.respuestasRequeridas} respuestas. Equipos cuenta: ${equipos.length}`
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
      `Desde ahora te enviaré las mismas alertas que salen por correo (grupo de correo / tu cuenta).\n` +
      `Escribe *ESTADO* para ver los equipos de tu cuenta.`
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

function paginar(items, page = 0) {
  const p = Math.max(0, parseInt(page, 10) || 0);
  const start = p * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < items.length;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE) || 1);
  return { page: p, slice, hasMore, hasPrev: p > 0, total: items.length, totalPages };
}

function lineasOpciones(slice, { conVerMas = false } = {}) {
  const lineas = slice.map((it, i) => `${i + 1} - ${it.label}`);
  if (conVerMas) lineas.push(`${slice.length + 1} - Ver más`);
  return lineas.join('\n');
}

async function armarItemsMenu(contacto, { filtro = null, grupoId = null } = {}) {
  const { grupos, individuales, planos } = await equiposOrganizadosDeContacto(contacto);

  if (filtro) {
    const hits = filtrarEquipos(planos, filtro);
    return hits.map((e) => ({
      tipo: 'dispositivo',
      label: `${etiqueta(e)}${e.grupoNombre ? ` · ${e.grupoNombre}` : ''} (${e.estado_conexion || '?'})`,
      equipo: e,
    }));
  }

  if (grupoId != null) {
    const g = grupos.find((x) => String(x.id) === String(grupoId));
    const list = g?.dispositivos || [];
    return list.map((e) => ({
      tipo: 'dispositivo',
      label: `${etiqueta(e)} · ${e.imei} (${e.estado_conexion || '?'})`,
      equipo: e,
      grupoId: g?.id,
      grupoNombre: g?.nombre,
    }));
  }

  const items = [];
  for (const g of grupos) {
    items.push({
      tipo: 'grupo',
      id: g.id,
      label: `📁 ${g.nombre} (${g.dispositivos.length})`,
      grupo: g,
    });
  }
  for (const e of individuales) {
    items.push({
      tipo: 'dispositivo',
      label: `${etiqueta(e)} · ${e.imei} (${e.estado_conexion || '?'})`,
      equipo: e,
    });
  }
  return items;
}

async function enviarMenu(jid, contacto, {
  page = 0,
  filtro = null,
  grupoId = null,
  prefijo = '',
} = {}) {
  const items = await armarItemsMenu(contacto, { filtro, grupoId });
  const { slice, hasMore, hasPrev, total, totalPages, page: p } = paginar(items, page);

  if (!total && !filtro && grupoId == null) {
    const msg =
      contacto.username
        ? `Tu cuenta *${contacto.username}* está vinculada, pero aún no veo equipos en su asignación (grupos / deviceAccess).\nRevisa en ZTRACK → Administración que el grupo (ej. NESTLE CAMPAÑA) esté marcado para esa cuenta.`
        : `Este número está activado, pero no está ligado a una cuenta ZTRACK con equipos.\nPide a un admin que vincule el WhatsApp a tu usuario y asigne el grupo de equipos.`;
    encolarTexto(jid, msg, {
      contactoId: contacto.id,
      telefono: contacto.telefono,
      tipo: 'estado',
    });
    setCtx(jid, { vista: 'raiz', page: 0, filtro: null, grupoId: null, opciones: [] });
    return;
  }

  if (!total && filtro) {
    encolarTexto(
      jid,
      `No encontré nada con *«${filtro}»*.\nPrueba otro nombre, ZGRU o IMEI · *limpiar* · *todos*`,
      { contactoId: contacto.id, telefono: contacto.telefono, tipo: 'estado' }
    );
    setCtx(jid, { vista: 'filtro', page: 0, filtro, grupoId, opciones: [] });
    return;
  }

  const opciones = slice.map((it) => ({ ...it }));
  if (hasMore) opciones.push({ tipo: 'ver_mas' });

  let intro;
  if (filtro) intro = `Filtro *«${filtro}»* — *${total}* resultado(s):`;
  else if (grupoId != null) {
    const gName = items[0]?.grupoNombre || opciones[0]?.grupoNombre || 'Grupo';
    intro = `Equipos de *${gName}* (${total}):`;
  } else intro = `Equipos de tu cuenta (${total}):`;

  let texto = `${prefijo}${intro}\n\n${lineasOpciones(slice, { conVerMas: hasMore })}`;
  if (total > PAGE_SIZE) {
    texto += `\n_Pág. ${p + 1}/${totalPages}_`;
    if (hasPrev) texto += '\n*anterior* = página previa';
  }
  texto +=
    `\n\nElige *número*, escribe *nombre* / *ZGRU* / *IMEI* para filtrar` +
    (grupoId != null || filtro ? ' · *todos* · *limpiar*' : ' · *ver más*');

  encolarTexto(jid, texto, {
    contactoId: contacto.id,
    telefono: contacto.telefono,
    tipo: 'estado',
  });
  setCtx(jid, {
    vista: filtro ? 'filtro' : grupoId != null ? 'grupo' : 'raiz',
    page: p,
    filtro,
    grupoId,
    opciones,
  });
}

function formatearDetalle(e) {
  const d = e._flota;
  const u = d?.ultimo_dato ?? e.ultimo_dato ?? {};
  const estado = String(e.estado_conexion || d?.estado_conexion || '—').toUpperCase();
  return (
    `*${etiqueta(e)}*\n` +
    `${e.codigo || '—'} · IMEI ${e.imei} · ${estado}` +
    (e.grupoNombre ? ` · ${e.grupoNombre}` : '') +
    `\nSet ${u.set_point ?? '—'} °C · retorno ${u.return_air ?? '—'} · suministro ${u.temp_supply_1 ?? '—'}\n` +
    `Última conexión: ${e.ultima_actualizacion || d?.ultima_actualizacion || '—'}\n\n` +
    `Escribe *todos* para el menú, o filtra por otro nombre / ZGRU / IMEI.`
  );
}

async function abrirDetalle(jid, contacto, equipo) {
  encolarTexto(jid, formatearDetalle(equipo), {
    contactoId: contacto.id,
    telefono: contacto.telefono,
    tipo: 'estado',
  });
  setCtx(jid, {
    vista: 'dispositivo',
    ultimoImei: equipo.imei,
    opciones: [],
  });
}

async function manejarNavegacion(jid, contacto, texto, intencion) {
  const ctx = getCtx(jid);
  const t = String(texto || '').trim();
  const n = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (intencion === 'todos' || n === 'menu' || n === 'inicio') {
    await enviarMenu(jid, contacto, { page: 0 });
    return true;
  }
  if (intencion === 'limpiar') {
    if (ctx.grupoId) await enviarMenu(jid, contacto, { page: 0, grupoId: ctx.grupoId });
    else await enviarMenu(jid, contacto, { page: 0 });
    return true;
  }
  if (intencion === 'ver_mas') {
    await enviarMenu(jid, contacto, {
      page: (ctx.page || 0) + 1,
      filtro: ctx.filtro || null,
      grupoId: ctx.grupoId ?? null,
    });
    return true;
  }
  if (intencion === 'anterior') {
    if (ctx.vista === 'dispositivo') {
      if (ctx.grupoId) await enviarMenu(jid, contacto, { page: 0, grupoId: ctx.grupoId });
      else await enviarMenu(jid, contacto, { page: 0, filtro: ctx.filtro || null });
      return true;
    }
    const page = ctx.page || 0;
    if (page > 0) {
      await enviarMenu(jid, contacto, {
        page: page - 1,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
      });
    } else if (ctx.vista === 'grupo') {
      await enviarMenu(jid, contacto, { page: 0 });
    } else if (ctx.filtro) {
      await enviarMenu(jid, contacto, { page: 0 });
    } else {
      await enviarMenu(jid, contacto, { page: 0 });
    }
    return true;
  }

  if (intencion === 'opcion' && ctx.opciones?.length) {
    const idx = parseInt(n, 10) - 1;
    const op = ctx.opciones[idx];
    if (!op) {
      encolarTexto(jid, `Opción inválida. Elige 1–${ctx.opciones.length} o filtra por nombre.`, {
        contactoId: contacto.id,
        telefono: contacto.telefono,
        tipo: 'estado',
      });
      return true;
    }
    if (op.tipo === 'ver_mas') {
      await enviarMenu(jid, contacto, {
        page: (ctx.page || 0) + 1,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
      });
      return true;
    }
    if (op.tipo === 'grupo') {
      await enviarMenu(jid, contacto, { page: 0, grupoId: op.id || op.grupo?.id });
      return true;
    }
    if (op.tipo === 'dispositivo' && op.equipo) {
      await abrirDetalle(jid, contacto, op.equipo);
      return true;
    }
  }

  if (intencion === 'buscar') {
    const q = t.replace(/^(buscar|filtro|filtrar|busca)\s+/i, '').trim();
    await enviarMenu(jid, contacto, { page: 0, filtro: q, grupoId: ctx.grupoId ?? null });
    return true;
  }

  // Texto libre: filtro o match único
  if (intencion === 'texto' || intencion === 'estado') {
    if (intencion === 'estado' && /^(estado|equipos|hola|ayuda|menu|menú)$/i.test(t.trim())) {
      await enviarMenu(jid, contacto, { page: 0, prefijo: '' });
      return true;
    }
    if (intencion === 'texto' && t.length >= 2) {
      const planos = await equiposEfectivosDeContacto(contacto);
      const hits = filtrarEquipos(planos, t);
      if (hits.length === 1) {
        await abrirDetalle(jid, contacto, hits[0]);
        return true;
      }
      // Nombre de grupo exacto/parcial
      const { grupos } = await equiposOrganizadosDeContacto(contacto);
      const gHit = grupos.find((g) =>
        String(g.nombre || '')
          .toLowerCase()
          .includes(t.toLowerCase())
      );
      if (gHit && hits.length === 0) {
        await enviarMenu(jid, contacto, { page: 0, grupoId: gHit.id });
        return true;
      }
      await enviarMenu(jid, contacto, {
        page: 0,
        filtro: t,
        grupoId: ctx.vista === 'grupo' ? ctx.grupoId : null,
      });
      return true;
    }
  }

  return false;
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
    if (intencion === 'estado' || intencion === 'todos') {
      await enviarMenu(jid, actualizado, { page: 0 });
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

  const handled = await manejarNavegacion(jid, contacto, texto, intencion);
  if (handled) return { estado: true, contacto };

  await enviarMenu(jid, contacto, { page: 0 });
  return { estado: true, contacto };
}
