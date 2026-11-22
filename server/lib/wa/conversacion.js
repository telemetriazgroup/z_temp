import {
  obtenerContacto,
  obtenerContactoPorTelefono,
  registrarEvento,
  registrarMensaje,
  registrarRespuestaPrueba,
  confirmarAlertasPorRespuesta,
} from './repository.js';
import { encolarTexto, marcarInbound, pendientePorJid } from './outbox.js';
import { jidDeTelefono, telefonoDeJid } from './telefono.js';
import { TIEMPOS_WA } from './tiempos.js';
import {
  equiposEfectivosDeContacto,
  equiposOrganizadosDeContacto,
  filtrarEquipos,
} from './equiposCuenta.js';
import {
  excel12h,
  graficaHoras,
  labelLista,
  textoDetalle,
  textoMenuEquipo,
  textoUltimoDato,
  textoUltimos20,
} from './consultaEquipo.js';
import { textoAnalisis } from './analisisChat.js';
import {
  cambiosUltimaHora,
  esContactoSuperadmin,
  fueraDeRangoMasDe2h,
  resumenFlota,
  textoFueraDeRango,
  textoMenuGeneral,
} from './generalFlota.js';
import { problemasDeContacto, textoSeguimiento } from './seguimiento.js';

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
  if (/^(anterior|atras|volver|pagina anterior|pag anterior)$/.test(t)) return 'anterior';
  if (/^(ver mas|vermás|siguiente|pagina siguiente|pag siguiente)$/.test(t)) return 'ver_mas';
  if (/^(general|flota)$/.test(t)) return 'general';
  if (/^(resumen|seguimiento)$/.test(t)) return 'resumen';
  if (/^(todos|todas|menu|inicio)$/.test(t)) return 'todos';
  if (/^(hola|ola|holi|hey|hi|hello|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|saludos)[!. ]*$/.test(t)) {
    return 'saludo';
  }
  if (/^(ayuda|como funciona|que puedes hacer|quien eres|info)$/.test(t)) return 'guia';
  if (/^(buscar|filtro|filtrar|busca)\s+/.test(t)) return 'buscar';
  if (/^(estado|equipos)$/.test(t)) return 'estado';
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
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE) || 1);
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const start = p * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < items.length;
  return { page: p, slice, hasMore, hasPrev: p > 0, total: items.length, totalPages };
}

function lineasOpciones(slice, { hasMore = false, hasPrev = false, page = 0, totalPages = 1 } = {}) {
  const lineas = slice.map((it, i) => `${i + 1} - ${it.label}`);
  if (hasMore) lineas.push('9 - Página siguiente');
  if (hasPrev) lineas.push('0 - Página anterior');
  if (totalPages > 1) {
    lineas.push('', `Página ${page + 1} de ${totalPages}.`);
    if (hasMore) lineas.push('*9* o *siguiente* — pasa a la página siguiente');
    if (hasPrev) lineas.push('*0* o *anterior* — vuelve a la página anterior');
  }
  return lineas.join('\n');
}

const OPCIONES_GENERAL = [
  { tipo: 'ver_equipos' },
  { tipo: 'fuera_2h' },
  { tipo: 'general' },
];

async function enviarGeneral(jid, contacto) {
  const { cuentas, total, primerosOnline } = await resumenFlota();
  const cambios = await cambiosUltimaHora();
  responder(
    jid,
    contacto,
    textoMenuGeneral({ cuentas, total, primerosOnline, cambios })
  );
  setCtx(jid, { vista: 'general', page: 0, filtro: null, grupoId: null, opciones: OPCIONES_GENERAL, equipo: null });
}

async function enviarResumen(jid, contacto, { page = 0 } = {}) {
  const { totalEquipos, items } = await problemasDeContacto(contacto);
  const cuentas = {
    fuera: items.filter((i) => i.clase === 'fuera').length,
    espera: items.filter((i) => i.clase === 'espera').length,
    apagado: items.filter((i) => i.clase === 'apagado').length,
  };
  const { slice, hasMore, hasPrev, totalPages, page: p } = paginar(items, page);
  const opciones = slice.map((it) => ({ tipo: 'dispositivo', equipo: it.equipo, label: it.label }));
  if (hasMore) opciones.push({ tipo: 'ver_mas', resumen: true });
  responder(
    jid,
    contacto,
    textoSeguimiento(slice, { totalEquipos, cuentas, hasMore, hasPrev, page: p, totalPages })
  );
  setCtx(jid, { vista: 'resumen', page: p, filtro: null, grupoId: null, opciones, equipo: null });
}

async function armarItemsMenu(contacto, { filtro = null, grupoId = null } = {}) {
  const { grupos, individuales, planos } = await equiposOrganizadosDeContacto(contacto);

  if (filtro) {
    const hits = filtrarEquipos(planos, filtro);
    return hits.map((e) => ({
      tipo: 'dispositivo',
      label: labelLista(e),
      equipo: e,
    }));
  }

  if (grupoId != null) {
    const g = grupos.find((x) => String(x.id) === String(grupoId));
    const list = g?.dispositivos || [];
    return list.map((e) => ({
      tipo: 'dispositivo',
      label: labelLista(e),
      equipo: e,
      grupoId: g?.id,
      grupoNombre: g?.nombre,
    }));
  }

  if (esContactoSuperadmin(contacto)) {
    return planos.map((e) => ({
      tipo: 'dispositivo',
      label: labelLista(e),
      equipo: e,
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
      label: labelLista(e),
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
  const pedido = Math.max(0, parseInt(page, 10) || 0);
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
      `No encontré un equipo con *«${filtro}»*.\n\n${textoGuia()}`,
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
  } else if (esContactoSuperadmin(contacto)) intro = `Toda la flota (${total}):`;
  else intro = `Equipos de tu cuenta (${total}):`;

  const avisoFin = pedido > p ? 'Ya estás en la última página.\n\n' : '';
  let texto = `${prefijo}${avisoFin}${intro}\n\n${lineasOpciones(slice, { hasMore, hasPrev, page: p, totalPages })}`;
  texto += `\n\nElige el *número* del equipo, o escribe el *nombre*, el *ZGRU* o el *IMEI*.`;
  if (grupoId != null || filtro) texto += '\n*todos* vuelve al inicio. *limpiar* quita el filtro.';
  if (!hasPrev) texto += '\n*0* o *resumen* — fuera de rango, en espera y apagados, con el tiempo.';
  if (esContactoSuperadmin(contacto)) texto += '\n*general* vuelve al resumen de la flota.';

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

const ACCIONES_EQUIPO = [
  { tipo: 'accion', id: 'ultimo' },
  { tipo: 'accion', id: 'detalle' },
  { tipo: 'accion', id: 'ultimos20' },
  { tipo: 'accion', id: 'grafica3' },
  { tipo: 'accion', id: 'grafica12' },
  { tipo: 'accion', id: 'excel12' },
  { tipo: 'accion', id: 'analisis' },
];

function textoGuia(nombre) {
  const quien = nombre ? `Hola ${nombre}. ` : 'Hola. ';
  return (
    `${quien}Soy el monitor *ZTRACK*. Vigilo la telemetría de los equipos de tu cuenta y te aviso si uno queda *fuera de rango* o *apagado*.\n\n` +
    `Cómo hablar conmigo:\n` +
    `• *menu* o *todos* — lista de equipos y grupos asignados\n` +
    `• *resumen* — cuáles están fuera de rango, en espera o apagados, y desde hace cuánto\n` +
    `• Escribe el *nombre* o el *ZGRU* para filtrar\n` +
    `• Elige el *número* del equipo`
  );
}

function responder(jid, contacto, texto, extra = {}) {
  encolarTexto(jid, texto, {
    contactoId: contacto.id,
    telefono: contacto.telefono,
    tipo: 'estado',
    ...extra,
  });
}

async function abrirMenuEquipo(jid, contacto, equipo) {
  const prev = getCtx(jid);
  responder(jid, contacto, textoMenuEquipo(equipo));
  setCtx(jid, {
    vista: 'menu_equipo',
    equipo,
    grupoId: prev.grupoId ?? null,
    filtro: prev.filtro ?? null,
    page: prev.page ?? 0,
    opciones: ACCIONES_EQUIPO,
  });
}

async function ejecutarAccionEquipo(jid, contacto, equipo, id) {
  try {
    if (id === 'ultimo') {
      responder(jid, contacto, `Busco la última trama de *${equipo.nombre || equipo.imei}*.`);
      responder(jid, contacto, await textoUltimoDato(equipo, contacto.username));
      return;
    }
    if (id === 'detalle') {
      responder(jid, contacto, textoDetalle(equipo, contacto.username));
      return;
    }
    if (id === 'ultimos20') {
      responder(jid, contacto, await textoUltimos20(equipo, contacto.username));
      return;
    }
    if (id === 'grafica3' || id === 'grafica12') {
      const hecho = await graficaHoras(equipo, id === 'grafica3' ? 3 : 12);
      responder(jid, contacto, hecho.texto, hecho.media ? { media: hecho.media } : {});
      return;
    }
    if (id === 'excel12') {
      responder(jid, contacto, `Armo el CSV de 12 h de *${equipo.nombre || equipo.imei}*.`);
      const hecho = await excel12h(equipo, contacto.username);
      responder(jid, contacto, hecho.texto, hecho.media ? { media: hecho.media } : {});
      return;
    }
    if (id === 'analisis') {
      responder(jid, contacto, `Reviso *${equipo.nombre || equipo.imei}*: rango y apagado.`);
      responder(jid, contacto, await textoAnalisis(equipo, contacto.username));
    }
  } catch (e) {
    console.warn('[wa] consulta', id, e.message);
    responder(jid, contacto, `No pude armar esa consulta (${e.message}). Prueba otra opción o *volver*.`);
  }
}

function accionPorTexto(n) {
  if (n === '1' || /ultimo dato|ultima trama/.test(n)) return 'ultimo';
  if (n === '2' || /detalle|informacion detallada/.test(n)) return 'detalle';
  if (n === '3' || /ultimos?\s*20|\b20\b/.test(n)) return 'ultimos20';
  if (n === '4' || /grafica\s*3|\b3\s*h\b/.test(n)) return 'grafica3';
  if (n === '5' || /grafica\s*12|\b12\s*h\b/.test(n)) return 'grafica12';
  if (n === '6' || /excel|csv|archivo|descargar/.test(n)) return 'excel12';
  if (n === '7' || /analisis|fuera de rango|apagado/.test(n)) return 'analisis';
  return null;
}

async function manejarNavegacion(jid, contacto, texto, intencion) {
  const ctx = getCtx(jid);
  const t = String(texto || '').trim();
  const n = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (intencion === 'saludo' || intencion === 'guia') {
    let guia = textoGuia(nombrePila(contacto.nombre));
    if (esContactoSuperadmin(contacto)) {
      guia += '\n• *general* — resumen de toda la flota: en línea, wait, offline y fuera de rango';
    }
    responder(jid, contacto, guia);
    return true;
  }

  if (intencion === 'general') {
    if (!esContactoSuperadmin(contacto)) {
      responder(jid, contacto, 'El resumen *general* es de la cuenta superadmin. Escribe *menu* para ver tus equipos.');
      return true;
    }
    await enviarGeneral(jid, contacto);
    return true;
  }

  if (intencion === 'resumen') {
    await enviarResumen(jid, contacto, { page: 0 });
    return true;
  }

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
    if (ctx.vista === 'resumen') {
      await enviarResumen(jid, contacto, { page: (ctx.page || 0) + 1 });
      return true;
    }
    if (ctx.vista === 'general') {
      responder(jid, contacto, 'Escribe *1* para ver los equipos. *9* o *siguiente* avanzan dentro de esa lista.');
      return true;
    }
    if (ctx.vista === 'menu_equipo') {
      responder(jid, contacto, 'Escribe el número de la opción o *volver* para la lista.');
      return true;
    }
    await enviarMenu(jid, contacto, {
      page: (ctx.page || 0) + 1,
      filtro: ctx.filtro || null,
      grupoId: ctx.grupoId ?? null,
      lista: true,
    });
    return true;
  }
  if (intencion === 'anterior') {
    if (ctx.vista === 'resumen') {
      const page = ctx.page || 0;
      if (page > 0) await enviarResumen(jid, contacto, { page: page - 1 });
      else await enviarMenu(jid, contacto, { page: 0 });
      return true;
    }
    if (ctx.vista === 'menu_equipo' || ctx.vista === 'dispositivo') {
      await enviarMenu(jid, contacto, {
        page: 0,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
        lista: true,
      });
      return true;
    }
    const page = ctx.page || 0;
    if (page > 0) {
      await enviarMenu(jid, contacto, {
        page: page - 1,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
        lista: true,
      });
    } else if (ctx.vista === 'grupo') {
      await enviarMenu(jid, contacto, { page: 0 });
    } else if (ctx.filtro) {
      await enviarMenu(jid, contacto, { page: 0, lista: true });
    } else {
      await enviarMenu(jid, contacto, { page: 0 });
    }
    return true;
  }

  if (n === '0' && (ctx.vista === 'raiz' || ctx.vista === 'filtro' || ctx.vista === 'grupo' || ctx.vista === 'resumen')) {
    const page = ctx.page || 0;
    if (ctx.vista === 'resumen' && page > 0) {
      await enviarResumen(jid, contacto, { page: page - 1 });
    } else if (page > 0) {
      await enviarMenu(jid, contacto, {
        page: page - 1,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
        lista: true,
      });
    } else if (ctx.vista === 'resumen') {
      await enviarMenu(jid, contacto, { page: 0 });
    } else {
      await enviarResumen(jid, contacto, { page: 0 });
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
    if (op.tipo === 'ver_equipos') {
      await enviarMenu(jid, contacto, { page: 0, lista: true });
      return true;
    }
    if (op.tipo === 'fuera_2h') {
      const lista = await fueraDeRangoMasDe2h();
      responder(jid, contacto, textoFueraDeRango(lista));
      setCtx(jid, { vista: 'general', page: 0, filtro: null, grupoId: null, opciones: OPCIONES_GENERAL });
      return true;
    }
    if (op.tipo === 'general') {
      await enviarGeneral(jid, contacto);
      return true;
    }
    if (op.tipo === 'ver_mas') {
      if (ctx.vista === 'resumen' || op.resumen) {
        await enviarResumen(jid, contacto, { page: (ctx.page || 0) + 1 });
        return true;
      }
      await enviarMenu(jid, contacto, {
        page: (ctx.page || 0) + 1,
        filtro: ctx.filtro || null,
        grupoId: ctx.grupoId ?? null,
        lista: true,
      });
      return true;
    }
    if (op.tipo === 'grupo') {
      await enviarMenu(jid, contacto, { page: 0, grupoId: op.id || op.grupo?.id });
      return true;
    }
    if (op.tipo === 'accion' && ctx.equipo) {
      await ejecutarAccionEquipo(jid, contacto, ctx.equipo, op.id);
      return true;
    }
    if (op.tipo === 'dispositivo' && op.equipo) {
      await abrirMenuEquipo(jid, contacto, op.equipo);
      return true;
    }
  }

  if (ctx.vista === 'menu_equipo' && ctx.equipo) {
    const accion = accionPorTexto(n);
    if (accion) {
      await ejecutarAccionEquipo(jid, contacto, ctx.equipo, accion);
      return true;
    }
  }

  if (/analis|fuera de rango/.test(n)) {
    const resto = n
      .replace(/analis\w*|fuera de rango|el equipo|equipo|\bde\b|\bdel\b|\bla\b|\bel\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const planos = await equiposEfectivosDeContacto(contacto);
    const hits = resto.length >= 2 ? filtrarEquipos(planos, resto) : planos;
    const equipo = ctx.equipo || (hits.length === 1 ? hits[0] : null);
    if (equipo) {
      await ejecutarAccionEquipo(jid, contacto, equipo, 'analisis');
      return true;
    }
    responder(
      jid,
      contacto,
      'Para el análisis dime el nombre del equipo, o escribe *menu*, elige el número y luego *7*.'
    );
    return true;
  }

  if (intencion === 'buscar') {
    const q = t.replace(/^(buscar|filtro|filtrar|busca)\s+/i, '').trim();
    await enviarMenu(jid, contacto, { page: 0, filtro: q, grupoId: ctx.grupoId ?? null });
    return true;
  }

  // Texto libre: filtro o match único
  if (intencion === 'texto' || intencion === 'estado') {
    if (intencion === 'estado' && /^(estado|equipos)$/i.test(t.trim())) {
      await enviarMenu(jid, contacto, { page: 0, prefijo: '' });
      return true;
    }
    if (intencion === 'texto' && t.length >= 2) {
      const planos = await equiposEfectivosDeContacto(contacto);
      const hits = filtrarEquipos(planos, t);
      if (hits.length === 1) {
        await abrirMenuEquipo(jid, contacto, hits[0]);
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
  let contacto = await obtenerContactoPorTelefono(tel);
  await registrarMensaje({
    contactoId: contacto?.id,
    telefono: tel,
    direccion: 'in',
    texto,
    tipo: 'chat',
  }).catch(() => {});

  if (!contacto || !contacto.activo) return { ignorado: true };

  const intencion = intencionDe(texto);

  if (contacto.consultaLibre && !contacto.alertasHabilitadas && !contacto.pruebaIniciadaEn) {
    contacto = await confirmarAlertasPorRespuesta(contacto.id);
    const quien = nombrePila(contacto.nombre);
    encolarTexto(
      jid,
      `${quien ? `${quien}, ` : ''}listo. Este número ya puede consultar los equipos que te habilitó el superadmin, sin cuenta web y sin la prueba de vinculación.\n` +
        `Las alertas automáticas siguen desde ahora, de a una cada minuto.`,
      { contactoId: contacto.id, telefono: contacto.telefono, tipo: 'estado' }
    );
  }

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

  responder(jid, contacto, textoGuia(nombrePila(contacto.nombre)));
  return { estado: true, contacto };
}
