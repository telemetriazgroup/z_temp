/**
 * Alertas a grupos de WhatsApp.
 * Un grupo no recibe nada hasta que se guarda con activo: true.
 * Automático de 05:00 a 22:00 (America/Lima). Fuera de ese horario
 * solo responde si mencionan al bot y piden una gráfica.
 */
import nodemailer from 'nodemailer';
import { readJson, writeJson } from '../store.js';
import { deviceRowKey } from '../telemetry.js';
import { horasSinComunicacion } from '../enlaceCaido.js';
import { isEquipoApagado } from '../powerState.js';
import { effectiveEnRangoAlertaFromDispositivo } from '../historicalTelemetry.js';
import { resolveRangoOptsForDevice } from '../deviceAlertConfigRepository.js';
import { getSmtpConfig } from '../smtpRepository.js';
import { getDeviceNameByImei, getDeviceNameByRowKey, getDeviceNamesView } from '../deviceNamesRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { fechaCorta, graficaHoras, pieMenu } from './consultaEquipo.js';
import { textoAnalisis } from './analisisChat.js';
import { encolarTexto } from './outbox.js';

const FILE = 'grupos_wa_alerta.json';
const AVISOS = 'grupos_wa_avisos.json';
const CORREO_SIN_GRAFICA = 'ztrack@zgroup.com.pe';

const UMBRAL_FUERA_RANGO = 2;
const UMBRAL_APAGADO = 2;
const UMBRAL_FUERA_LINEA = 3;

function horaLima(now) {
  const texto = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return Number(texto);
}

export function enVentanaAlertaGrupo(now = new Date()) {
  const hora = horaLima(now);
  return hora >= 5 && hora < 22;
}

function slotHorario(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (tipo) => parts.find((p) => p.type === tipo)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}|${g('hour')}`;
}

function umbralHoras(value, defecto) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(24, Math.max(1, Math.round(n)));
}

function leerTodo() {
  const raw = readJson(FILE, { grupos: [] });
  return Array.isArray(raw?.grupos) ? raw.grupos : [];
}

function guardarTodo(grupos) {
  writeJson(FILE, { grupos });
}

export function configDeGrupo(jid) {
  return leerTodo().find((g) => g.jid === jid) || null;
}

export function guardarGrupoAlerta(input) {
  const jid = String(input?.jid || '').trim();
  if (!jid.endsWith('@g.us')) {
    const error = new Error('Elija un grupo de WhatsApp. Un chat privado no se configura aquí.');
    error.status = 400;
    throw error;
  }
  const previo = configDeGrupo(jid) || {};
  const next = {
    jid,
    nombre: String(input?.nombre || previo.nombre || '').trim() || previo.nombre || jid,
    activo: input?.activo === true,
    umbralFueraRango: umbralHoras(input?.umbralFueraRango, previo.umbralFueraRango ?? UMBRAL_FUERA_RANGO),
    umbralApagado: umbralHoras(input?.umbralApagado, previo.umbralApagado ?? UMBRAL_APAGADO),
    umbralFueraLinea: umbralHoras(input?.umbralFueraLinea, previo.umbralFueraLinea ?? UMBRAL_FUERA_LINEA),
    menciones: [
      ...new Set(
        (Array.isArray(input?.menciones) ? input.menciones : [])
          .map((x) => String(x || '').trim())
          .filter((x) => x.includes('@'))
      ),
    ],
    rowKeys: [
      ...new Set(
        (Array.isArray(input?.rowKeys) ? input.rowKeys : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      ),
    ],
    updatedAt: new Date().toISOString(),
  };
  if (next.activo && next.rowKeys.length === 0) {
    const error = new Error('Marque al menos un equipo antes de activar este grupo.');
    error.status = 400;
    throw error;
  }
  const grupos = leerTodo().filter((g) => g.jid !== jid);
  grupos.push(next);
  guardarTodo(grupos);
  return next;
}

export function mezclarGrupos(vivos) {
  const guardados = new Map(leerTodo().map((g) => [g.jid, g]));
  return (vivos || []).map((vivo) => {
    const cfg = guardados.get(vivo.jid);
    return {
      jid: vivo.jid,
      nombre: vivo.nombre,
      participantes: vivo.participantes || [],
      activo: cfg?.activo === true,
      umbralFueraRango: cfg?.umbralFueraRango ?? UMBRAL_FUERA_RANGO,
      umbralApagado: cfg?.umbralApagado ?? UMBRAL_APAGADO,
      umbralFueraLinea: cfg?.umbralFueraLinea ?? UMBRAL_FUERA_LINEA,
      menciones: cfg?.menciones || [],
      rowKeys: cfg?.rowKeys || [],
    };
  });
}

function leerAvisos() {
  const raw = readJson(AVISOS, { episodios: {}, enviados: {} });
  if (!raw.episodios) raw.episodios = {};
  if (!raw.enviados) raw.enviados = {};
  return raw;
}

function condicionDe(dispositivo, now) {
  const estado = String(dispositivo?.estado_conexion || '').toLowerCase();
  if (estado === 'offline' || estado === 'historial' || dispositivo?.ausente_api === true) {
    const horas = horasSinComunicacion(dispositivo, now);
    return {
      kind: 'fuera_linea',
      horas,
      since: dispositivo?.ultima_actualizacion || null,
    };
  }
  if (isEquipoApagado(dispositivo) === true) {
    return { kind: 'apagado', horas: null, since: null };
  }
  const rowKey = deviceRowKey(dispositivo);
  const enRango = effectiveEnRangoAlertaFromDispositivo(
    dispositivo,
    resolveRangoOptsForDevice(rowKey)
  );
  if (enRango === false) return { kind: 'fuera_rango', horas: null, since: null };
  return null;
}

function tituloEvento(kind) {
  if (kind === 'apagado') return 'Apagado';
  if (kind === 'fuera_linea') return 'Fuera de línea';
  return 'Fuera de rango';
}

function umbralDe(cfg, kind) {
  if (kind === 'apagado') return cfg.umbralApagado;
  if (kind === 'fuera_linea') return cfg.umbralFueraLinea;
  return cfg.umbralFueraRango;
}

function nombreLimpio(value) {
  const s = String(value || '').trim();
  if (!s || s === '—' || s.toUpperCase() === 'SIN ASIGNAR') return '';
  return s;
}

function zgruDe(texto) {
  const m = String(texto || '').match(/ZGRU\d+/i);
  return m ? m[0].toUpperCase() : null;
}

export function saludoLima(now = new Date()) {
  const hora = horaLima(now);
  if (hora >= 5 && hora < 12) return 'Buenos días';
  if (hora >= 12 && hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function indiceNombres() {
  const porClave = new Map();
  const grupos = [];
  const raw = readJson('grupos.json', []);
  for (const g of Array.isArray(raw) ? raw : []) {
    const equipos = [];
    for (const d of g.devices || []) {
      if (d?.enabled === false) continue;
      const imei = String(d.imei || '').trim();
      if (!imei) continue;
      const rowKey = String(d.rowKey || (d.codigo ? `${d.codigo}-${imei}` : imei));
      const plataforma = nombreLimpio(d.nombrePlataforma);
      const desc = nombreLimpio(d.descripcionEquipo);
      const guardado = nombreLimpio(getDeviceNameByRowKey(rowKey)) || nombreLimpio(getDeviceNameByImei(imei));
      const zgru = zgruDe(desc) || zgruDe(plataforma) || zgruDe(guardado);
      const nombre = plataforma || guardado || (zgru ? '' : desc);
      const prev = porClave.get(rowKey) || { alias: new Set(), zgru: null, nombre: '', imei, codigo: d.codigo || '' };
      if (nombre && !prev.nombre) prev.nombre = nombre;
      if (plataforma) prev.alias.add(plataforma);
      if (desc) prev.alias.add(desc);
      if (guardado) prev.alias.add(guardado);
      if (zgru) prev.zgru = zgru;
      porClave.set(rowKey, prev);
      equipos.push({
        rowKey,
        imei,
        codigo: d.codigo || '',
        nombre: nombre || zgru || imei,
        zgru,
      });
    }
    grupos.push({ id: String(g.id || g.nombre || equipos.length), nombre: g.nombre || 'Sin nombre', equipos });
  }
  const view = getDeviceNamesView();
  for (const [rowKey, name] of Object.entries(view.namesByRowKey || {})) {
    const limpio = nombreLimpio(name);
    if (!limpio) continue;
    const prev = porClave.get(rowKey) || { alias: new Set(), zgru: null, nombre: '', imei: '', codigo: '' };
    if (!prev.nombre) prev.nombre = limpio;
    prev.alias.add(limpio);
    const zgru = zgruDe(limpio);
    if (zgru && !prev.zgru) prev.zgru = zgru;
    porClave.set(rowKey, prev);
  }
  return { porClave, grupos };
}

export function catalogoParaUi() {
  const { porClave, grupos } = indiceNombres();
  const nombres = [];
  for (const [rowKey, f] of porClave) {
    nombres.push({
      rowKey,
      imei: f.imei || '',
      codigo: f.codigo || '',
      nombre: f.nombre || '',
      zgru: f.zgru || null,
    });
  }
  return { grupos, nombres };
}

function nombreDe(dispositivo, indice) {
  const rowKey = deviceRowKey(dispositivo);
  const ficha = indice?.porClave?.get(rowKey);
  const guardado = nombreLimpio(ficha?.nombre) || nombreLimpio(getDeviceNameByRowKey(rowKey)) || nombreLimpio(getDeviceNameByImei(dispositivo?.imei));
  const zgru = ficha?.zgru || zgruDe(guardado);
  if (guardado && zgru && !guardado.toUpperCase().includes(zgru)) return `${guardado} · ${zgru}`;
  if (guardado) return guardado;
  if (zgru) return zgru;
  return dispositivo?.imei || rowKey;
}

function equipoParaGrafica(dispositivo, indice) {
  return {
    imei: dispositivo.imei,
    codigo: dispositivo.codigo,
    nombre: nombreDe(dispositivo, indice),
    rowKey: deviceRowKey(dispositivo),
    estado_conexion: dispositivo.estado_conexion,
    ultima_actualizacion: dispositivo.ultima_actualizacion,
    ultimo_dato: dispositivo.ultimo_dato,
    _flota: dispositivo,
  };
}

async function correoSinGrafica({ dispositivo, kind, horas, since }) {
  const smtp = getSmtpConfig();
  if (!smtp?.user || !smtp?.appPassword) return;
  const nombre = nombreDe(dispositivo);
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtp.user, pass: String(smtp.appPassword).replace(/\s/g, '') },
  });
  const evento = tituloEvento(kind);
  const desde = since ? fechaCorta(since) : 'sin referencia';
  const horasTxt = Number.isFinite(Number(horas)) ? `${Math.round(Number(horas) * 10) / 10} h` : '—';
  await transporter.sendMail({
    from: `"${smtp.fromName || 'ZTRACK TELEMETRY'}" <${smtp.user}>`,
    to: CORREO_SIN_GRAFICA,
    subject: `Sin gráfica 12 h · ${nombre} · ${evento}`,
    text: [
      `El equipo ${nombre} tiene un evento y no hay gráfica de 12 horas para el grupo de WhatsApp.`,
      `Evento: ${evento}`,
      `IMEI: ${dispositivo.imei}`,
      `API: ${dispositivo.codigo || '—'}`,
      `Desde: ${desde}`,
      `Horas: ${horasTxt}`,
    ].join('\n'),
  });
}

function textoMenciones(menciones) {
  return (menciones || [])
    .map((jid) => `@${String(jid).split('@')[0]}`)
    .filter((x) => x.length > 1)
    .join(' ');
}

function armarAviso({ saludo, marcas, nombre, analisis }) {
  const cabeza = `${saludo}${marcas ? ` ${marcas}` : ''}\nTenemos una observación en el reefer *${nombre}*.`;
  const pie = 'Gráfica de comportamiento de las últimas 12 horas.';
  const menu = pieMenu();
  const cuerpo = String(analisis || '')
    .replace(menu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const base = `${cabeza}\n\n${pie}`;
  if (!cuerpo) return base;
  const hueco = 880 - base.length - 2;
  if (hueco < 80) return base;
  const corto = cuerpo.length > hueco ? `${cuerpo.slice(0, hueco - 1).trimEnd()}…` : cuerpo;
  return `${cabeza}\n\n${corto}\n\n${pie}`;
}

export async function evaluarAvisosGrupoWhatsapp(dispositivos, now = new Date()) {
  const activos = leerTodo().filter((g) => g.activo === true && (g.rowKeys || []).length > 0);
  if (!activos.length || !Array.isArray(dispositivos) || !dispositivos.length) return;
  const indice = indiceNombres();
  const porClave = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));
  const avisos = leerAvisos();
  const episodes = readJson('state.json', {}).episodes || {};
  const ventana = enVentanaAlertaGrupo(now);
  const slot = slotHorario(now);
  let cambio = false;
  const vistos = new Set();

  for (const cfg of activos) {
    for (const rowKey of cfg.rowKeys) {
      const dispositivo = porClave.get(rowKey);
      if (!dispositivo) continue;
      const claveEp = `${rowKey}`;
      vistos.add(claveEp);
      const condicion = condicionDe(dispositivo, now);
      if (!condicion) {
        if (avisos.episodios[claveEp]) {
          delete avisos.episodios[claveEp];
          cambio = true;
        }
        continue;
      }
      let since = condicion.since;
      let horas = condicion.horas;
      if (condicion.kind === 'fuera_linea') {
        if (avisos.episodios[claveEp]) {
          delete avisos.episodios[claveEp];
          cambio = true;
        }
      } else {
        const motor = episodes[rowKey];
        const previo = avisos.episodios[claveEp];
        if (motor?.kind === condicion.kind && motor.since) since = motor.since;
        else if (previo?.kind === condicion.kind && previo.since) since = previo.since;
        else since = now.toISOString();
        const ms = new Date(since).getTime();
        horas = Number.isFinite(ms) ? (now.getTime() - ms) / 3600000 : 0;
        if (!previo || previo.kind !== condicion.kind || previo.since !== since) {
          avisos.episodios[claveEp] = { kind: condicion.kind, since };
          cambio = true;
        }
      }
      if (!ventana || !(Number(horas) >= umbralDe(cfg, condicion.kind))) continue;
      const claveEnvio = `${cfg.jid}|${rowKey}|${condicion.kind}`;
      if (avisos.enviados[claveEnvio] === slot) continue;
      avisos.enviados[claveEnvio] = slot;
      cambio = true;
      const equipo = equipoParaGrafica(dispositivo, indice);
      const grafica = await graficaHoras(equipo, 12).catch(() => null);
      if (!grafica?.media) {
        await correoSinGrafica({
          dispositivo,
          kind: condicion.kind,
          horas,
          since,
        }).catch((e) => console.warn('[wa-grupo] correo', e.message));
        continue;
      }
      const analisis = await textoAnalisis(equipo, null).catch(() => '');
      const texto = armarAviso({
        saludo: saludoLima(now),
        marcas: textoMenciones(cfg.menciones),
        nombre: equipo.nombre,
        analisis,
      });
      encolarTexto(cfg.jid, texto, {
        esAlerta: true,
        telefono: cfg.jid,
        tipo: 'alerta_grupo',
        media: grafica.media,
        mentions: cfg.menciones,
      });
    }
  }

  for (const clave of Object.keys(avisos.episodios)) {
    if (!vistos.has(clave)) {
      delete avisos.episodios[clave];
      cambio = true;
    }
  }
  if (cambio) writeJson(AVISOS, avisos);
}

const ESPERA_CHARLA_MS = 5 * 60 * 1000;
const charlas = new Map();
const PALABRAS_VACIAS = new Set([
  'grafica', 'grafico', 'horas', 'hora', 'ultimas', 'ultima', 'reefer', 'equipo', 'informacion',
  'info', 'por', 'favor', 'hola', 'buenos', 'dias', 'buenas', 'tardes', 'noches', 'quiero', 'ver',
  'dame', 'muestrame', 'sobre', 'del', 'los', 'las', 'una', 'uno', 'para', 'con', 'que', 'como',
  'esta', 'este', 'alerta', 'alertas', 'comportamiento', 'analisis', 'opcion', 'numero', 'nro',
]);

function sinAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function palabrasDe(texto) {
  return sinAcento(texto)
    .replace(/@\d+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !PALABRAS_VACIAS.has(w) && !/^zgru\d+$/.test(w));
}

export function rankearReefers(palabras, fichas) {
  const unicas = [...new Set(palabras)];
  const scored = [];
  for (const f of fichas) {
    let n = 0;
    for (const p of unicas) {
      if (f.blob.includes(p)) n += 1;
    }
    if (n > 0) scored.push({ ...f, n });
  }
  scored.sort((a, b) => b.n - a.n || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return scored.slice(0, 5);
}

export function interpretarRespuesta(texto, opciones = []) {
  const t = sinAcento(texto).replace(/@\d+/g, ' ').trim();
  const zgrus = t.match(/zgru\d+/g) || [];
  if (zgrus.length === 1) return { tipo: 'zgru', zgru: zgrus[0].toUpperCase() };
  const soloNumero = t.match(/^(?:opcion|numero|nro|la|el)?\s*([1-5])$/);
  if (soloNumero) {
    const indice = Number(soloNumero[1]) - 1;
    if (opciones[indice]) return { tipo: 'numero', indice };
  }
  if (palabrasDe(texto).length || (t.match(/\d{14,16}/g) || []).length) return { tipo: 'buscar' };
  return { tipo: 'vacio' };
}

function mencionaAlBot(msg, client) {
  const yo = client?.info?.wid;
  if (!yo) return false;
  const user = String(yo.user || '');
  const serialized = String(yo._serialized || '');
  const ids = []
    .concat(msg?.mentionedIds || [])
    .concat(msg?._data?.mentionedJidList || [])
    .map((id) => (typeof id === 'string' ? id : id?._serialized || ''))
    .filter(Boolean);
  if (ids.some((id) => id === serialized || (user && id.startsWith(`${user}@`)))) return true;
  const body = String(msg?.body || '');
  return Boolean(user) && body.includes(`@${user}`);
}

function autorDe(msg) {
  return String(msg?.author || msg?.id?.participant || msg?._data?.author || '').trim();
}

function claveCharla(jid, autor) {
  return `${jid}|${autor}`;
}

function charlaViva(jid, autor, ahora) {
  if (!autor) return null;
  const clave = claveCharla(jid, autor);
  const charla = charlas.get(clave);
  if (!charla) return null;
  if (ahora - charla.ultimo > ESPERA_CHARLA_MS) {
    charlas.delete(clave);
    return null;
  }
  return charla;
}

function fichasDeFlota(flota, indice) {
  return flota.map((d) => {
    const rowKey = deviceRowKey(d);
    const extra = indice.porClave.get(rowKey);
    const nombre = nombreDe(d, indice);
    const zgru = extra?.zgru || zgruDe(nombre);
    const alias = extra ? [...extra.alias] : [];
    const blob = sinAcento([nombre, zgru, d.imei, d.codigo, ...alias].filter(Boolean).join(' '));
    return { dispositivo: d, rowKey, nombre, zgru, imei: d.imei, codigo: d.codigo || '', blob };
  });
}

function lineaOpcion(ficha, n) {
  const zgru = ficha.zgru && !String(ficha.nombre).toUpperCase().includes(ficha.zgru) ? ficha.zgru : '';
  return `${n}. *${ficha.nombre}*${zgru ? ` · ${zgru}` : ''} · ${ficha.codigo || '—'} · ${ficha.imei}`;
}

function responderGrupo(jid, texto, autor) {
  const mentions = autor && autor.includes('@') ? [autor] : undefined;
  const marca = mentions ? `@${autor.split('@')[0]}\n` : '';
  encolarTexto(jid, `${marca}${texto}`, {
    esAlerta: false,
    telefono: jid,
    tipo: 'grafica_grupo',
    mentions,
  });
}

async function enviarGraficaElegida(jid, autor, ficha) {
  const equipo = equipoParaGrafica(ficha.dispositivo, null);
  equipo.nombre = ficha.nombre;
  const grafica = await graficaHoras(equipo, 12).catch(() => null);
  const marca = autor && autor.includes('@') ? `@${autor.split('@')[0]}\n` : '';
  if (!grafica?.media) {
    encolarTexto(jid, `${marca}No hay gráfica de 12 horas para *${ficha.nombre}*.`, {
      esAlerta: false,
      telefono: jid,
      tipo: 'grafica_grupo',
      mentions: autor && autor.includes('@') ? [autor] : undefined,
    });
    return;
  }
  const analisis = await textoAnalisis(equipo, null).catch(() => '');
  const menu = pieMenu();
  const cuerpo = String(analisis || '').replace(menu, '').trim();
  const pie = `Gráfica de comportamiento de las últimas 12 horas de *${ficha.nombre}*.`;
  const hueco = 880 - marca.length - pie.length - 4;
  const corto = cuerpo && hueco > 80 ? (cuerpo.length > hueco ? `${cuerpo.slice(0, hueco - 1).trimEnd()}…` : cuerpo) : '';
  encolarTexto(jid, [marca.trimEnd(), corto, pie].filter(Boolean).join('\n\n'), {
    esAlerta: false,
    telefono: jid,
    tipo: 'grafica_grupo',
    media: grafica.media,
    mentions: autor && autor.includes('@') ? [autor] : undefined,
  });
}

function guardarCharla(jid, autor, opciones) {
  if (!autor) return;
  charlas.set(claveCharla(jid, autor), { opciones, ultimo: Date.now() });
}

async function abrirBusqueda(jid, autor, texto, flota, indice) {
  const palabras = palabrasDe(texto);
  const imeis = String(texto || '').match(/\d{14,16}/g) || [];
  const fichas = fichasDeFlota(flota, indice);
  let ranked = rankearReefers([...palabras, ...imeis], fichas);
  if (!palabras.length && !imeis.length) {
    responderGrupo(jid, 'Dígame el nombre o el ZGRU del reefer.', autor);
    guardarCharla(jid, autor, []);
    return;
  }
  if (!ranked.length) {
    responderGrupo(jid, 'No hay coincidencias de lo que busca.', autor);
    guardarCharla(jid, autor, []);
    return;
  }
  const lista = ranked.map((f, i) => lineaOpcion(f, i + 1)).join('\n');
  responderGrupo(
    jid,
    `Encontré estas opciones, de mayor a menor coincidencia:\n${lista}\n\n¿De cuál quiere ver la gráfica? Indique el ZGRU o el número del 1 al ${ranked.length}.`,
    autor
  );
  guardarCharla(jid, autor, ranked);
}

export async function atenderMencionGrupo({ msg, client, jid }) {
  const ahora = Date.now();
  for (const [clave, charla] of charlas) {
    if (ahora - charla.ultimo > ESPERA_CHARLA_MS) charlas.delete(clave);
  }
  const autor = autorDe(msg);
  const mencionado = mencionaAlBot(msg, client);
  const charla = charlaViva(jid, autor, ahora);
  if (!mencionado && !charla) return;
  const texto = String(msg?.body || '').trim();
  const decision = interpretarRespuesta(texto, charla?.opciones || []);
  if (charla && decision.tipo === 'numero') {
    charla.ultimo = ahora;
    await enviarGraficaElegida(jid, autor, charla.opciones[decision.indice]);
    return;
  }
  const flota = await loadCurrentDispositivos().catch(() => []);
  const indice = indiceNombres();
  if (decision.tipo === 'zgru') {
    const fichas = fichasDeFlota(flota, indice);
    const hits = fichas.filter((f) => f.zgru === decision.zgru || f.blob.includes(decision.zgru.toLowerCase()));
    if (hits.length === 1) {
      guardarCharla(jid, autor, hits);
      await enviarGraficaElegida(jid, autor, hits[0]);
      return;
    }
    if (charla) {
      const enLista = (charla.opciones || []).filter((f) => f.zgru === decision.zgru);
      if (enLista.length === 1) {
        charla.ultimo = ahora;
        await enviarGraficaElegida(jid, autor, enLista[0]);
        return;
      }
    }
    if (!hits.length) {
      responderGrupo(jid, `No hay coincidencias de ${decision.zgru}.`, autor);
      guardarCharla(jid, autor, []);
      return;
    }
    const ranked = hits.slice(0, 5);
    const lista = ranked.map((f, i) => lineaOpcion(f, i + 1)).join('\n');
    responderGrupo(
      jid,
      `${decision.zgru} está en más de un origen:\n${lista}\n\nIndique el número del 1 al ${ranked.length}.`,
      autor
    );
    guardarCharla(jid, autor, ranked);
    return;
  }
  if (!mencionado && decision.tipo === 'vacio') {
    responderGrupo(jid, 'Indique el ZGRU o el número del 1 al 5. Si escribe un nombre, busco de nuevo.', autor);
    if (charla) charla.ultimo = ahora;
    return;
  }
  await abrirBusqueda(jid, autor, texto, flota, indice);
}
