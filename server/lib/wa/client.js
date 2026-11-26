import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { iniciarOutbox, setWaSender } from './outbox.js';
import { recibirMensaje } from './conversacion.js';
import { atenderMencionGrupo, recordarIdentidadBot } from './gruposAlerta.js';
import { reasignarTelefono, registrarMensaje } from './repository.js';
import { jidDeTelefono, normalizarTelefono, telefonoDeJid } from './telefono.js';

const sessionsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../wa-sessions');
let reintentoPerfil = false;

/** El candado de Chromium apunta al contenedor anterior. Ese proceso ya no existe. */
function perfilAjeno() {
  const lock = path.join(sessionsDir, 'session', 'SingletonLock');
  let destino = '';
  try {
    destino = fs.readlinkSync(lock);
  } catch {
    return false;
  }
  const [host, pidRaw] = String(destino).split('-');
  if (!host || host !== os.hostname()) return true;
  const pid = Number(pidRaw);
  if (!pid) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

function digitosJid(valor) {
  return String(valor || '').split('@')[0].replace(/\D/g, '');
}

function idSerializado(participante) {
  const id = participante?.id;
  if (!id) return '';
  if (typeof id === 'string') return id;
  return id._serialized || (id.user && id.server ? `${id.user}@${id.server}` : '');
}

function mismoNumero(a, b) {
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

/** La etiqueta tiene que usar el id con el que esa persona está en el grupo. */
async function alinearMencionesGrupo(client, jid, body, pedidos) {
  const textoBase = typeof body === 'string' ? body : String(body?.text ?? '');
  if (!pedidos?.length) return { texto: textoBase, mentions: undefined };
  let resueltas = pedidos.map((id) => String(id));
  if (String(jid).endsWith('@g.us') && client?.getChatById) {
    try {
      const chat = await client.getChatById(jid);
      const participants = Array.isArray(chat?.participants) ? chat.participants : [];
      const porId = new Map(participants.map((p) => [idSerializado(p), p]));
      let pares = null;
      resueltas = [];
      for (const pedido of pedidos) {
        const id = String(pedido);
        if (porId.has(id)) {
          resueltas.push(id);
          continue;
        }
        const dig = digitosJid(id);
        const hallado = participants.find((p) => mismoNumero(digitosJid(idSerializado(p)), dig));
        if (hallado) {
          resueltas.push(idSerializado(hallado));
          continue;
        }
        if (!pares && dig && client.getContactLidAndPhone) {
          const ids = participants.map(idSerializado).filter(Boolean);
          pares = ids.length ? await client.getContactLidAndPhone(ids).catch(() => []) : [];
        }
        const par = (pares || []).find((item) => mismoNumero(String(item?.pn || '').replace(/\D/g, ''), dig));
        const lid = String(par?.lid?._serialized || par?.lid || '');
        resueltas.push(lid.includes('@') ? lid : id);
      }
    } catch (e) {
      console.warn('[wa] menciones del grupo', e.message);
    }
  }
  let texto = textoBase;
  pedidos.forEach((pedido, i) => {
    const antes = digitosJid(pedido);
    const despues = digitosJid(resueltas[i]);
    if (antes && despues && antes !== despues) texto = texto.split(`@${antes}`).join(`@${despues}`);
  });
  return { texto, mentions: [...new Set(resueltas.filter((id) => String(id).includes('@')))] };
}

function quitarCandadosPerfil() {
  const dir = path.join(sessionsDir, 'session');
  for (const nombre of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      fs.unlinkSync(path.join(dir, nombre));
    } catch {
      /* el candado ya no está */
    }
  }
}

const estado = {
  fase: 'detenido',
  qr: null,
  qrDataUrl: null,
  telefono: null,
  error: null,
  actualizadoEn: null,
};

const pasos = [];

function registrarPaso(id, titulo, detalle, status = 'ok') {
  const hora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const entry = { id, titulo, detalle, status, hora };
  const idx = pasos.findIndex((p) => p.id === id);
  if (idx >= 0) pasos[idx] = entry;
  else pasos.push(entry);
}

let client = null;
let iniciando = false;

function chromiumPath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function tocar(parcial) {
  Object.assign(estado, parcial, { actualizadoEn: new Date().toISOString() });
}

export function estadoWa() {
  const wid = client?.info?.wid?.user || null;
  if (wid) {
    estado.fase = 'conectado';
    estado.telefono = wid;
    estado.qr = null;
    estado.qrDataUrl = null;
    estado.error = null;
  }
  const { qr: _qr, ...publico } = estado;
  return {
    ...publico,
    telefono: wid || estado.telefono,
    chromium: Boolean(chromiumPath()),
    listo: Boolean(wid),
    pasos: pasos.map((p) => ({ ...p })),
  };
}

export async function enviarMensajePrueba({ telefono, texto } = {}) {
  const wid = client?.info?.wid?.user;
  if (!wid) {
    const error = new Error('WhatsApp no está listo. Espera el estado conectado antes de probar el envío.');
    error.status = 409;
    throw error;
  }
  const destino = normalizarTelefono(telefono || wid);
  const jid = jidDeTelefono(destino);
  if (!jid) {
    const error = new Error('Teléfono de prueba inválido');
    error.status = 400;
    throw error;
  }
  const hora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const body =
    String(texto || '').trim() ||
    `Prueba ZTRACK ${hora}. Si lees esto, el envío de WhatsApp funciona.`;
  const msg = await client.sendMessage(jid, body);
  await registrarMensaje({
    telefono: destino,
    direccion: 'out',
    texto: body,
    tipo: 'prueba_envio',
  }).catch(() => {});
  return {
    telefono: destino,
    texto: body,
    messageId: msg?.id?._serialized || null,
  };
}

function telefonoReal(crudo, from) {
  const telefono = normalizarTelefono(crudo);
  const lid = String(from || '').endsWith('@lid') ? telefonoDeJid(from) : '';
  if (!telefono || telefono === lid) return '';
  if (telefono.length < 11 || telefono.length > 13) return '';
  return telefono;
}

async function resolverEntrada(msg, wa) {
  const from = String(msg.from || '');
  try {
    const contact = await msg.getContact();
    const crudo = contact?.number || (String(contact?.id?._serialized || '').endsWith('@c.us') ? contact.id.user : '');
    const telefono = telefonoReal(crudo, from);
    if (telefono) return { telefono, jid: jidDeTelefono(telefono), lid: telefonoDeJid(from) };
  } catch (e) {
    console.warn('[wa] contacto', e.message);
  }
  if (from.endsWith('@lid') && wa?.getContactLidAndPhone) {
    try {
      const [par] = await wa.getContactLidAndPhone([from]);
      const telefono = telefonoReal(par?.pn, from);
      if (telefono) return { telefono, jid: jidDeTelefono(telefono), lid: telefonoDeJid(from) };
    } catch (e) {
      console.warn('[wa] lid', e.message);
    }
  }
  const telefono = telefonoDeJid(from);
  return {
    telefono,
    jid: from.endsWith('@c.us') ? from : jidDeTelefono(telefono),
    lid: '',
  };
}

async function qrADataUrl(qr) {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(qr, { margin: 1, width: 280 });
}

export async function startWaClient() {
  if (iniciando || client) return estadoWa();
  const exe = chromiumPath();
  registrarPaso('init', 'Estado de vinculación', 'Proceso de WhatsApp listo', 'ok');
  if (!exe) {
    registrarPaso('chromium', 'Chromium', 'No está instalado en este contenedor', 'error');
    tocar({
      fase: 'sin_chromium',
      error: 'Chromium no está en este contenedor. La configuración se guarda; el envío requiere la imagen con navegador.',
    });
    return estadoWa();
  }
  registrarPaso('chromium', 'Chromium', exe, 'ok');
  iniciando = true;
  tocar({ fase: 'iniciando', error: null });
  let reintentar = false;
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    if (perfilAjeno()) quitarCandadosPerfil();
    registrarPaso('sesion', 'Carpeta de sesión', sessionsDir, fs.existsSync(sessionsDir) ? 'ok' : 'warn');
    const { default: pkg } = await import('whatsapp-web.js');
    const { Client, LocalAuth, MessageMedia } = pkg;
    registrarPaso('cliente', 'Cliente WhatsApp', 'whatsapp-web.js listo', 'pending');
    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionsDir }),
      puppeteer: {
        executablePath: exe,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      },
    });
    c.on('qr', async (qr) => {
      if (c.info?.wid?.user) return;
      let qrDataUrl = null;
      try {
        qrDataUrl = await qrADataUrl(qr);
      } catch {
        qrDataUrl = null;
      }
      tocar({ fase: 'qr', qr, qrDataUrl, error: null });
      registrarPaso('qr', 'Código QR', 'Listo para escanear', 'pending');
    });
    c.on('authenticated', () => {
      tocar({ fase: 'autenticado', qr: null, qrDataUrl: null });
      registrarPaso('auth', 'Autenticado', 'Credenciales de WhatsApp Web guardadas', 'ok');
    });
    c.on('ready', () => {
      const wid = c.info?.wid?.user || null;
      recordarIdentidadBot(c).catch((e) => console.warn('[wa] identidad', e.message));
      tocar({ fase: 'conectado', telefono: wid, qr: null, qrDataUrl: null, error: null });
      registrarPaso('cliente', 'Cliente WhatsApp', 'whatsapp-web.js', 'ok');
      registrarPaso('conectado', 'WhatsApp conectado', `Sesión activa ${wid || ''}`.trim(), 'ok');
      const errorIdx = pasos.findIndex((p) => p.id === 'error');
      if (errorIdx >= 0) pasos.splice(errorIdx, 1);
      reintentoPerfil = false;
    });
    c.on('auth_failure', (msg) => {
      tocar({ fase: 'error', error: String(msg || 'auth_failure') });
      registrarPaso('auth', 'Autenticación', String(msg || 'auth_failure'), 'error');
    });
    c.on('disconnected', (reason) => {
      tocar({ fase: 'desconectado', error: String(reason || 'desconectado'), qr: null });
      client = null;
    });
    const gruposVistos = new Set();
    const idMensaje = (msg) => {
      const id = msg?.id;
      if (!id) return '';
      if (typeof id === 'string') return id;
      return id._serialized || '';
    };
    const jidGrupo = (msg) => {
      const from = String(msg?.from || '');
      if (from.endsWith('@g.us')) return from;
      const remote = msg?.id?.remote;
      const r = typeof remote === 'string' ? remote : remote?._serialized || '';
      return String(r).endsWith('@g.us') ? String(r) : '';
    };
    const tomarGrupo = (msg) => {
      const grupo = jidGrupo(msg);
      if (!grupo || msg.fromMe) return false;
      const id = idMensaje(msg);
      if (id) {
        if (gruposVistos.has(id)) return true;
        gruposVistos.add(id);
        if (gruposVistos.size > 400) gruposVistos.delete(gruposVistos.values().next().value);
      }
      atenderMencionGrupo({ msg, client: c, jid: grupo }).catch((e) => console.warn('[wa] grupo', e.message));
      return true;
    };
    c.on('message_create', (msg) => {
      tomarGrupo(msg);
    });
    c.on('message', (msg) => {
      const from = String(msg.from || '');
      if (msg.fromMe) return;
      if (tomarGrupo(msg)) return;
      const texto = String(msg.body || '').trim();
      if (!texto) return;
      resolverEntrada(msg, c)
        .then(async (entrada) => {
          if (entrada.lid && entrada.lid !== entrada.telefono) {
            await reasignarTelefono(entrada.lid, entrada.telefono).catch(() => {});
          }
          return recibirMensaje({ jid: entrada.jid, telefono: entrada.telefono, texto });
        })
        .catch((e) => console.warn('[wa] mensaje', e.message));
    });
    setWaSender(async (jid, body) => {
      const pedidos = Array.isArray(body?.mentions) ? body.mentions.filter(Boolean) : undefined;
      const alineado = await alinearMencionesGrupo(c, jid, body, pedidos);
      const mentions = alineado.mentions;
      const texto = alineado.texto;
      const enviar = async (conMencion) => {
        const marca = conMencion && mentions?.length ? mentions : undefined;
        if (body && typeof body === 'object' && body.media?.base64) {
          const media = new MessageMedia(body.media.mimetype, body.media.base64, body.media.filename);
          const documento = body.media.documento === true || !String(body.media.mimetype).startsWith('image/');
          return c.sendMessage(jid, media, {
            caption: texto ? String(texto).slice(0, 1024) : undefined,
            sendMediaAsDocument: documento,
            mentions: marca,
          });
        }
        const text = typeof body === 'string' ? texto : String(texto ?? '');
        return c.sendMessage(jid, text, marca ? { mentions: marca } : undefined);
      };
      try {
        return await enviar(true);
      } catch (e) {
        if (!mentions?.length) throw e;
        console.warn('[wa] reintento sin etiqueta', e.message);
        return enviar(false);
      }
    });
    iniciarOutbox();
    client = c;
    await c.initialize();
  } catch (e) {
    const texto = String(e?.message || e);
    const candado = /profile appears to be in use|SingletonLock|Code: 21/.test(texto);
    client = null;
    if (candado && !reintentoPerfil) {
      reintentoPerfil = true;
      reintentar = true;
      quitarCandadosPerfil();
      console.warn('[wa] perfil de Chromium bloqueado por un contenedor anterior; se reintenta');
    } else {
      const visible = candado
        ? 'Chromium dejó el perfil bloqueado por un arranque anterior. Reinicie la sesión de WhatsApp.'
        : texto;
      tocar({ fase: 'error', error: visible });
      registrarPaso('error', 'Error', visible, 'error');
    }
  } finally {
    iniciando = false;
  }
  if (reintentar) return startWaClient();
  return estadoWa();
}

export async function listarGruposEnSesion() {
  const wid = client?.info?.wid?.user;
  if (!wid || !client) {
    const error = new Error('WhatsApp no está conectado. Vincule la sesión antes de leer los grupos.');
    error.status = 409;
    throw error;
  }
  const chats = await client.getChats();
  const grupos = [];
  for (const chat of chats) {
    if (!chat?.isGroup) continue;
    const jid = chat.id?._serialized || '';
    if (!jid.endsWith('@g.us')) continue;
    let participants = Array.isArray(chat.participants) ? chat.participants : [];
    grupos.push({
      jid,
      nombre: String(chat.name || '').trim() || jid,
      participantes: participants
        .map((p) => {
          const id = p?.id?._serialized || (typeof p?.id === 'string' ? p.id : '');
          const numero = p?.id?.user || String(id).split('@')[0] || '';
          return {
            jid: id,
            numero,
            nombre: String(p?.name || p?.pushname || numero || '').trim(),
            admin: p?.isAdmin === true || p?.isSuperAdmin === true,
          };
        })
        .filter((p) => p.jid),
    });
  }
  grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return grupos;
}

export async function reiniciarWaClient() {
  if (client) {
    try {
      await client.destroy();
    } catch {
      /* el siguiente inicio levanta otra sesión */
    }
    client = null;
  }
  tocar({ fase: 'detenido', qr: null, qrDataUrl: null });
  return startWaClient();
}
