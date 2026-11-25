import { registrarMensaje } from './repository.js';
import { gapChatMs } from './ajustes.js';
import { TIEMPOS_WA, proximoEnvio, proximoEnvioAlertaNumero } from './tiempos.js';

const cola = [];
let seq = 1;
let sender = null;
let timerChat = null;
let timerAlerta = null;
let enviandoChat = false;
let enviandoAlerta = false;
const programadoJid = new Map();
const programadoAlertaJid = new Map();
const ultimoEnvioJid = new Map();

export function setWaSender(fn) {
  sender = fn;
}

export function marcarInbound() {
  /* la respuesta ya no depende de una ventana de chat activo */
}

export function chatActivo() {
  return true;
}

export function pendientePorJid(jid) {
  return cola.some((j) => j.jid === jid && !j.esAlerta);
}

export function encolarTexto(jid, text, { esAlerta = false, contactoId = null, telefono = null, tipo = null, media = null, mentions = null } = {}) {
  if (!jid || !text) return null;
  const ahora = Date.now();
  const gap = gapChatMs();
  const enviarEn = esAlerta
    ? proximoEnvioAlertaNumero({ ahora, ultimoDeEsteNumero: programadoAlertaJid.get(jid) || 0 })
    : proximoEnvio({
        ahora,
        esAlerta: false,
        ultimoJid: programadoJid.get(jid) || 0,
        gapMs: gap,
      });
  if (esAlerta) programadoAlertaJid.set(jid, enviarEn);
  else programadoJid.set(jid, enviarEn);
  const job = {
    id: seq++,
    jid,
    text,
    enviarEn,
    esAlerta,
    contactoId,
    telefono,
    tipo,
    media,
    mentions: Array.isArray(mentions) ? mentions : null,
  };
  cola.push(job);
  return job;
}

async function despachar(job) {
  const mentions = Array.isArray(job.mentions) && job.mentions.length ? job.mentions : undefined;
  const body = job.media
    ? { text: job.text, media: job.media, mentions }
    : mentions
      ? { text: job.text, mentions }
      : job.text;
  await sender(job.jid, body);
  if (!job.esAlerta) {
    const enviado = Date.now();
    ultimoEnvioJid.set(job.jid, enviado);
    programadoJid.set(job.jid, Math.max(programadoJid.get(job.jid) || 0, enviado));
  }
  await registrarMensaje({
    contactoId: job.contactoId,
    telefono: job.telefono || job.jid.split('@')[0],
    direccion: 'out',
    texto: job.text,
    tipo: job.tipo || (job.esAlerta ? 'alerta' : 'chat'),
  }).catch(() => {});
}

function tomar(esAlerta, ahora) {
  const idx = cola.findIndex((j) => j.esAlerta === esAlerta && j.enviarEn <= ahora);
  if (idx < 0) return null;
  return cola.splice(idx, 1)[0];
}

async function drenarChat() {
  if (enviandoChat || enviandoAlerta || !sender) return;
  const ahora = Date.now();
  const idx = cola.findIndex((j) => !j.esAlerta && j.enviarEn <= ahora);
  if (idx < 0) return;
  const candidato = cola[idx];
  const ultimo = ultimoEnvioJid.get(candidato.jid) || 0;
  const gap = gapChatMs();
  if (ultimo && ahora - ultimo < gap) {
    candidato.enviarEn = ultimo + gap;
    return;
  }
  const job = cola.splice(idx, 1)[0];
  enviandoChat = true;
  try {
    await despachar(job);
  } catch (e) {
    job.intentos = (job.intentos || 0) + 1;
    if (job.intentos < 3) {
      job.enviarEn = Date.now() + gapChatMs();
      cola.push(job);
    } else {
      console.warn('[wa] no se pudo responder', job.jid, e.message);
      if (job.media) {
        encolarTexto(
          job.jid,
          `No pude adjuntar el archivo (${e.message}). Vuelve a pedir la opción 5.`,
          { contactoId: job.contactoId, telefono: job.telefono, tipo: 'estado' }
        );
      }
    }
  } finally {
    enviandoChat = false;
  }
}

async function drenarAlerta() {
  if (enviandoChat || enviandoAlerta || !sender) return;
  if (cola.some((j) => !j.esAlerta && j.enviarEn <= Date.now())) return;
  const job = tomar(true, Date.now());
  if (!job) return;
  enviandoAlerta = true;
  try {
    await despachar(job);
  } catch (e) {
    job.intentos = (job.intentos || 0) + 1;
    if (job.intentos < 3) {
      job.enviarEn = Date.now() + gapChatMs();
      cola.push(job);
    } else {
      console.warn('[wa] no se pudo enviar alerta', job.jid, e.message);
    }
  } finally {
    enviandoAlerta = false;
  }
}

export function iniciarOutbox() {
  if (!timerChat) {
    timerChat = setInterval(() => {
      drenarChat().catch((e) => console.warn('[wa] chat', e.message));
    }, TIEMPOS_WA.tickChatMs);
    timerChat.unref?.();
  }
  if (!timerAlerta) {
    timerAlerta = setInterval(() => {
      drenarAlerta().catch((e) => console.warn('[wa] alerta', e.message));
    }, TIEMPOS_WA.tickAlertaMs);
    timerAlerta.unref?.();
  }
}

export function colaPendiente() {
  return cola.length;
}
