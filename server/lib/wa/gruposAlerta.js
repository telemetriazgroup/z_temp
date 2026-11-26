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
import { ajusteDefrostAlerta } from '../analisis/defrostAlerta.js';
import { resolveRangoOptsForDevice } from '../deviceAlertConfigRepository.js';
import { getSmtpConfig } from '../smtpRepository.js';
import { getDeviceNameByImei, getDeviceNameByRowKey, getDeviceNamesView } from '../deviceNamesRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { fechaCorta, graficaHoras } from './consultaEquipo.js';
import { horaConversada, relatoParaGrupo } from './analisisChat.js';
import { encolarTexto } from './outbox.js';

const FILE = 'grupos_wa_alerta.json';
const AVISOS = 'grupos_wa_avisos.json';
const HISTORIAL = 'grupos_wa_historial.json';
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

function horaDesdeDe(cfg) {
  const n = Number(cfg?.horaDesde);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 5;
}

function horaHastaDe(cfg) {
  const n = Number(cfg?.horaHasta);
  return Number.isInteger(n) && n >= 1 && n <= 24 ? n : 22;
}

export function enVentanaDeGrupo(cfg, now = new Date()) {
  const hora = horaLima(now);
  return hora >= horaDesdeDe(cfg) && hora < horaHastaDe(cfg);
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
    horaDesde: horaDesdeDe({ horaDesde: input?.horaDesde ?? previo.horaDesde }),
    horaHasta: horaHastaDe({ horaHasta: input?.horaHasta ?? previo.horaHasta }),
    participantes: Array.isArray(input?.participantes) ? input.participantes : previo.participantes || [],
    updatedAt: new Date().toISOString(),
  };
  if (next.horaDesde >= next.horaHasta) {
    const error = new Error('La hora de inicio tiene que ser anterior a la hora de fin.');
    error.status = 400;
    throw error;
  }
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
  const vistos = new Set();
  const lista = (vivos || []).map((vivo) => {
    vistos.add(vivo.jid);
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
      horaDesde: horaDesdeDe(cfg),
      horaHasta: horaHastaDe(cfg),
    };
  });
  for (const g of guardados.values()) {
    if (!vistos.has(g.jid) && g.activo === true) lista.push(grupoDesdeGuardado(g));
  }
  return lista;
}

function grupoDesdeGuardado(g) {
  return {
    jid: g.jid,
    nombre: g.nombre || g.jid,
    participantes: g.participantes || [],
    activo: g.activo === true,
    umbralFueraRango: g.umbralFueraRango ?? UMBRAL_FUERA_RANGO,
    umbralApagado: g.umbralApagado ?? UMBRAL_APAGADO,
    umbralFueraLinea: g.umbralFueraLinea ?? UMBRAL_FUERA_LINEA,
    menciones: g.menciones || [],
    rowKeys: g.rowKeys || [],
    horaDesde: horaDesdeDe(g),
    horaHasta: horaHastaDe(g),
    guardado: true,
  };
}

export function listarGruposGuardados() {
  return leerTodo().map(grupoDesdeGuardado);
}

export function anotarHistorialGrupo(jid, texto, tipo) {
  if (!jid || !texto) return;
  const prev = readJson(HISTORIAL, []);
  const lista = Array.isArray(prev) ? prev : [];
  lista.unshift({
    jid,
    texto: String(texto).slice(0, 1800),
    tipo: tipo || 'respuesta',
    at: new Date().toISOString(),
  });
  writeJson(HISTORIAL, lista.slice(0, 400));
}

export function historialDeGrupo(jid) {
  const prev = readJson(HISTORIAL, []);
  return (Array.isArray(prev) ? prev : []).filter((x) => x.jid === jid).slice(0, 40);
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

/** Teléfono pegado al nombre del equipo: empieza en 9 y tiene 9 dígitos. No se muestra. */
export function nombreVisible(value) {
  const limpio = String(value || '')
    .replace(/(?:^|\s)9\d{8}(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio || String(value || '').trim();
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

function armarAviso({ saludo, marcas, nombre, relato }) {
  const saludoLinea = `${saludo}${marcas ? ` ${marcas}` : ''}`;
  const cuerpo = String(relato || '').trim();
  if (!cuerpo) return `${saludoLinea}\n*${nombre}*`;
  return `${saludoLinea}\n*${nombre}*\n${cuerpo}`;
}

export async function evaluarAvisosGrupoWhatsapp(dispositivos, now = new Date()) {
  const activos = leerTodo().filter((g) => g.activo === true && (g.rowKeys || []).length > 0);
  if (!activos.length || !Array.isArray(dispositivos) || !dispositivos.length) return;
  const indice = indiceNombres();
  const porClave = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));
  const porImei = new Map(dispositivos.filter((d) => d?.imei).map((d) => [String(d.imei), d]));
  const avisos = leerAvisos();
  const episodes = readJson('state.json', {}).episodes || {};
  const slot = slotHorario(now);
  let cambio = false;
  const vistos = new Set();

  for (const cfg of activos) {
    for (const rowKey of cfg.rowKeys) {
      const dispositivo = dispositivoGuardado(porClave, porImei, rowKey);
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
        if (condicion.kind === 'fuera_rango' && since) {
          const aj = await ajusteDefrostAlerta(dispositivo, since, now).catch(() => null);
          if (aj?.pausar) continue;
          if (aj && !aj.falso && aj.horasQuitar > 0) horas = Math.max(0, horas - aj.horasQuitar);
          if (aj && !aj.falso && aj.fueraDesde && aj.fueraDesde !== since) since = aj.fueraDesde;
        }
        if (!previo || previo.kind !== condicion.kind || previo.since !== since) {
          avisos.episodios[claveEp] = { kind: condicion.kind, since };
          cambio = true;
        }
      }
      if (!enVentanaDeGrupo(cfg, now) || !(Number(horas) >= umbralDe(cfg, condicion.kind))) continue;
      const claveEnvio = `${cfg.jid}|${rowKey}|${condicion.kind}`;
      if (avisos.enviados[claveEnvio] === slot) continue;
      avisos.enviados[claveEnvio] = slot;
      cambio = true;
      const equipo = equipoParaGrafica(dispositivo, indice);
      const grafica = await graficaHoras(equipo, 12, { titulo: '12 h' }).catch(() => null);
      if (!grafica?.media) {
        await correoSinGrafica({
          dispositivo,
          kind: condicion.kind,
          horas,
          since,
        }).catch((e) => console.warn('[wa-grupo] correo', e.message));
        continue;
      }
      const relato = await relatoParaGrupo(equipo).catch(() => ({ texto: '' }));
      const texto = armarAviso({
        saludo: saludoLima(now),
        marcas: textoMenciones(cfg.menciones),
        nombre: nombreVisible(equipo.nombre),
        relato: condicion.kind === 'fuera_linea'
          ? `No está comunicando desde ${horaConversada(since, now)}.`
          : relato.texto,
      });
      anotarHistorialGrupo(cfg.jid, texto, 'alerta');
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
const identidadBot = { usuarios: new Set(), jids: new Set() };

function idTexto(id) {
  if (!id) return '';
  if (typeof id === 'string') return id;
  return id._serialized || id.$1 || '';
}

export async function recordarIdentidadBot(client) {
  const wid = client?.info?.wid;
  const user = String(wid?.user || '').split(':')[0].replace(/\D/g, '');
  const ser = idTexto(wid);
  if (user) identidadBot.usuarios.add(user);
  if (ser) identidadBot.jids.add(ser);
  if (!client?.getContactLidAndPhone || !ser) return;
  try {
    const lista = await client.getContactLidAndPhone([ser]);
    const par = Array.isArray(lista) ? lista[0] : null;
    const lid = idTexto(par?.lid);
    const pn = String(par?.pn || '').replace(/\D/g, '');
    if (lid) {
      identidadBot.jids.add(lid);
      const u = lid.split('@')[0].split(':')[0];
      if (u) identidadBot.usuarios.add(u);
    }
    if (pn) identidadBot.usuarios.add(pn);
  } catch (e) {
    console.warn('[wa] identidad', e.message);
  }
}

function idsMencionados(msg) {
  return []
    .concat(msg?.mentionedIds || [])
    .concat(msg?._data?.mentionedJidList || [])
    .map(idTexto)
    .filter(Boolean);
}

function coincideUsuario(candidato, usuarios) {
  const limpio = String(candidato || '').replace(/\D/g, '');
  if (limpio.length < 8) return false;
  for (const u of usuarios) {
    if (!u) continue;
    if (limpio === u || limpio.endsWith(u) || u.endsWith(limpio)) return true;
  }
  return false;
}
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

function textoSinMencion(texto) {
  return String(texto || '')
    .replace(/@\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabrasDe(texto) {
  return sinAcento(textoSinMencion(texto))
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
  const t = sinAcento(textoSinMencion(texto)).trim();
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

async function mencionaAlBot(msg, client) {
  if (identidadBot.usuarios.size === 0) await recordarIdentidadBot(client);
  const mencionados = idsMencionados(msg);
  if (
    mencionados.some(
      (id) => identidadBot.jids.has(id) || identidadBot.usuarios.has(id.split('@')[0].split(':')[0])
    )
  ) {
    return true;
  }
  const body = String(msg?.body || '');
  for (const u of identidadBot.usuarios) {
    if (u && body.includes(`@${u}`)) return true;
  }
  const marcas = body.match(/@\+?[\d\s-]{8,22}/g) || [];
  if (marcas.some((m) => coincideUsuario(m, identidadBot.usuarios))) return true;
  if (!mencionados.length || !client?.getContactLidAndPhone) return false;
  try {
    const pares = await client.getContactLidAndPhone(mencionados);
    for (const par of pares || []) {
      const lid = idTexto(par?.lid);
      const pn = String(par?.pn || '');
      if (lid && identidadBot.jids.has(lid)) return true;
      if (coincideUsuario(pn, identidadBot.usuarios)) return true;
    }
  } catch (e) {
    console.warn('[wa] lid mencion', e.message);
  }
  return false;
}

function autorDe(msg) {
  return idTexto(msg?.author || msg?.id?.participant || msg?._data?.author || msg?._data?.participant);
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

function imeiDeClave(rowKey) {
  const m = String(rowKey || '').match(/(\d{14,16})$/);
  return m ? m[1] : '';
}

function dispositivoGuardado(porClave, porImei, rowKey) {
  const directo = porClave.get(rowKey);
  if (directo) return directo;
  const imei = imeiDeClave(rowKey);
  return imei ? porImei.get(imei) || null : null;
}

function clavesGuardadas(jid) {
  const set = new Set();
  for (const rowKey of configDeGrupo(jid)?.rowKeys || []) {
    const s = String(rowKey || '').trim();
    if (!s) continue;
    set.add(s);
    set.add(s.toUpperCase());
    const imei = imeiDeClave(s);
    if (imei) set.add(imei);
  }
  return set;
}

function fichasAgregadas(flota, indice, jid) {
  const claves = clavesGuardadas(jid);
  if (!claves.size) return [];
  return fichasDeFlota(flota, indice).filter(
    (f) => claves.has(f.rowKey) || claves.has(String(f.rowKey).toUpperCase()) || (f.imei && claves.has(String(f.imei)))
  );
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
  return `${n}. *${nombreVisible(ficha.nombre)}*`;
}

const dichos = [];
const turnos = new Map();

function recordarDicho(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) return;
  dichos.push({ texto: limpio, at: Date.now() });
  if (dichos.length > 40) dichos.shift();
}

function esEcoPropio(texto) {
  const t = sinAcento(textoSinMencion(texto));
  if (!t) return false;
  const ahora = Date.now();
  return dichos.some((d) => {
    if (ahora - d.at > 2 * 60 * 1000) return false;
    const propio = sinAcento(textoSinMencion(d.texto));
    return propio && (t === propio || t.includes(propio.slice(0, 80)));
  });
}

function reservarTurno(jid, autor, texto) {
  const clave = `${jid}|${autor}|${sinAcento(textoSinMencion(texto))}`;
  const ahora = Date.now();
  for (const [k, at] of turnos) {
    if (ahora - at > 60 * 1000) turnos.delete(k);
  }
  const previo = turnos.get(clave) || 0;
  if (ahora - previo < 8000) return false;
  turnos.set(clave, ahora);
  return true;
}

function responderGrupo(jid, texto, autor) {
  const mentions = autor && autor.includes('@') ? [autor] : undefined;
  const marca = mentions ? `@${autor.split('@')[0]}\n` : '';
  const completo = `${marca}${texto}`;
  recordarDicho(completo);
  anotarHistorialGrupo(jid, completo, 'respuesta');
  encolarTexto(jid, completo, {
    esAlerta: false,
    telefono: jid,
    tipo: 'grafica_grupo',
    mentions,
  });
}

function textoSinFichas(jid, flota) {
  if (!Array.isArray(flota) || flota.length === 0) return '';
  const guardados = configDeGrupo(jid)?.rowKeys?.length || 0;
  if (guardados > 0) return 'No pude leer ahora los equipos de este grupo.';
  return 'Este grupo todavía no tiene equipos agregados.';
}

async function enviarGraficaElegida(jid, autor, ficha) {
  const equipo = equipoParaGrafica(ficha.dispositivo, null);
  equipo.nombre = nombreVisible(ficha.nombre);
  const grafica = await graficaHoras(equipo, 12, { titulo: '12 h' }).catch(() => null);
  const marca = autor && autor.includes('@') ? `@${autor.split('@')[0]}\n` : '';
  const visible = nombreVisible(ficha.nombre);
  if (!grafica?.media) {
    const aviso = `${marca}No hay gráfica de 12 horas para *${visible}*.`;
    recordarDicho(aviso);
    encolarTexto(jid, aviso, {
      esAlerta: false,
      telefono: jid,
      tipo: 'grafica_grupo',
      mentions: autor && autor.includes('@') ? [autor] : undefined,
    });
    return;
  }
  const relato = await relatoParaGrupo(equipo).catch(() => ({ texto: 'No pude leer las últimas 12 horas.' }));
  const caption = [marca.trimEnd(), `*${visible}*`, relato.texto].filter(Boolean).join('\n');
  recordarDicho(caption);
  anotarHistorialGrupo(jid, caption, 'grafica');
  encolarTexto(jid, caption, {
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
  const imeis = String(textoSinMencion(texto)).match(/\d{14,16}/g) || [];
  if (!palabras.length && !imeis.length) return;
  const fichas = fichasAgregadas(flota, indice, jid);
  if (!fichas.length) {
    if (charlas.get(claveCharla(jid, autor))?.opciones?.length) return;
    const aviso = textoSinFichas(jid, flota);
    if (!aviso) return;
    responderGrupo(jid, aviso, autor);
    guardarCharla(jid, autor, []);
    return;
  }
  const ranked = rankearReefers([...palabras, ...imeis], fichas);
  if (!ranked.length) {
    responderGrupo(jid, 'No hay coincidencias entre los equipos agregados a este grupo.', autor);
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
  const textoPrevio = String(msg?.body || '').trim();
  if (esEcoPropio(textoPrevio) || !reservarTurno(jid, autor, textoPrevio)) return;
  const mencionado = await mencionaAlBot(msg, client);
  const charla = charlaViva(jid, autor, ahora);
  if (!mencionado && !charla) {
    const ids = idsMencionados(msg);
    if (ids.length || String(msg?.body || '').includes('@')) {
      console.warn('[wa] grupo sin respuesta', jid, autor || 'sin-autor', ids.join('|') || String(msg.body || '').slice(0, 80));
    }
    return;
  }
  const texto = String(msg?.body || '').trim();
  const decision = interpretarRespuesta(texto, charla?.opciones || []);
  if (decision.tipo === 'vacio') {
    if (mencionado && !charla) guardarCharla(jid, autor, []);
    return;
  }
  console.log('[wa] grupo responde', jid, autor || 'sin-autor');
  if (charla && decision.tipo === 'numero') {
    charla.ultimo = ahora;
    await enviarGraficaElegida(jid, autor, charla.opciones[decision.indice]);
    return;
  }
  const flota = await loadCurrentDispositivos().catch(() => []);
  const indice = indiceNombres();
  if (decision.tipo === 'zgru') {
    const fichas = fichasAgregadas(flota, indice, jid);
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
      if (!fichas.length && charlas.get(claveCharla(jid, autor))?.opciones?.length) return;
      const aviso = fichas.length
        ? `No hay coincidencias de ${decision.zgru} entre los equipos agregados a este grupo.`
        : textoSinFichas(jid, flota);
      if (!aviso) return;
      responderGrupo(jid, aviso, autor);
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
  await abrirBusqueda(jid, autor, texto, flota, indice);
}
