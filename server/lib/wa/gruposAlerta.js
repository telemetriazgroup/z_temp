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
import { getDeviceNameByImei, getDeviceNameByRowKey } from '../deviceNamesRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { fechaCorta, graficaHoras } from './consultaEquipo.js';
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

function nombreDe(dispositivo) {
  const rowKey = deviceRowKey(dispositivo);
  const guardado = getDeviceNameByRowKey(rowKey) || getDeviceNameByImei(dispositivo?.imei);
  const limpio = String(guardado || '').trim();
  if (!limpio || limpio.toUpperCase() === 'SIN ASIGNAR') return dispositivo?.imei || rowKey;
  return limpio;
}

function equipoParaGrafica(dispositivo) {
  return {
    imei: dispositivo.imei,
    codigo: dispositivo.codigo,
    nombre: nombreDe(dispositivo),
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

export async function evaluarAvisosGrupoWhatsapp(dispositivos, now = new Date()) {
  const activos = leerTodo().filter((g) => g.activo === true && (g.rowKeys || []).length > 0);
  if (!activos.length || !Array.isArray(dispositivos) || !dispositivos.length) return;
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
      const equipo = equipoParaGrafica(dispositivo);
      const evento = tituloEvento(condicion.kind);
      const horasTxt = Math.round(Number(horas) * 10) / 10;
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
      const marcas = textoMenciones(cfg.menciones);
      const texto = [
        `*${equipo.nombre}*`,
        `${evento} desde ${fechaCorta(since)}. Lleva ${horasTxt} h.`,
        `Gráfica de las últimas 12 horas.`,
        marcas || null,
      ]
        .filter(Boolean)
        .join('\n');
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

function textoPideGrafica(texto) {
  const t = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /grafica|12\s*h|12 horas|ultimas 12/.test(t);
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

function buscarEquipos(flota, texto) {
  const imeis = String(texto || '').match(/\d{14,16}/g) || [];
  let hits = imeis.length
    ? flota.filter((d) => imeis.includes(String(d.imei)))
    : [];
  if (!hits.length) {
    const q = String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/grafica|12\s*h|12 horas|ultimas 12/g, ' ')
      .replace(/@\d+/g, ' ')
      .trim();
    if (q.length >= 3) {
      hits = flota.filter((d) => {
        const nombre = nombreDe(d).toLowerCase();
        return nombre.includes(q) || String(d.imei).includes(q);
      });
    }
  }
  const codigo = String(texto || '').toUpperCase();
  const conCodigo = hits.filter((d) => codigo.includes(String(d.codigo || '').toUpperCase()));
  if (conCodigo.length === 1) return conCodigo;
  return hits;
}

export async function atenderMencionGrupo({ msg, client, jid }) {
  if (!mencionaAlBot(msg, client)) return;
  const texto = String(msg?.body || '').trim();
  if (!textoPideGrafica(texto)) return;
  const flota = await loadCurrentDispositivos().catch(() => []);
  const hits = buscarEquipos(flota, texto);
  if (hits.length === 0) {
    encolarTexto(jid, 'Mención recibida. Escribe *gráfica*, el IMEI y la API (TUNEL, STARCOOL, STARCOOL2 o TERMOKING).', {
      esAlerta: false,
      telefono: jid,
      tipo: 'grafica_grupo',
    });
    return;
  }
  if (hits.length > 1) {
    const lista = hits
      .slice(0, 6)
      .map((d) => `${d.codigo} · ${d.imei}`)
      .join('\n');
    encolarTexto(jid, `Ese IMEI está en más de una API. Pide la gráfica con el origen:\n${lista}`, {
      esAlerta: false,
      telefono: jid,
      tipo: 'grafica_grupo',
    });
    return;
  }
  const equipo = equipoParaGrafica(hits[0]);
  const grafica = await graficaHoras(equipo, 12).catch(() => null);
  if (!grafica?.media) {
    encolarTexto(jid, grafica?.texto || `No hay gráfica de 12 horas para *${equipo.nombre}*.`, {
      esAlerta: false,
      telefono: jid,
      tipo: 'grafica_grupo',
    });
    return;
  }
  encolarTexto(jid, grafica.texto, {
    esAlerta: false,
    telefono: jid,
    tipo: 'grafica_grupo',
    media: grafica.media,
  });
}
