import { registrarMensaje } from './repository.js';
import { TIEMPOS_WA, proximoEnvio } from './tiempos.js';

const cola = [];
let seq = 1;
let sender = null;
let timerChat = null;
let timerAlerta = null;
let enviandoChat = false;
let enviandoAlerta = false;
let slotAlerta = 0;
const programadoJid = new Map();

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

export function encolarTexto(jid, text, { esAlerta = false, contactoId = null, telefono = null, tipo = null } = {}) {
  if (!jid || !text) return null;
  const ahora = Date.now();
  const enviarEn = proximoEnvio({
    ahora,
    esAlerta,
    ultimoJid: esAlerta ? 0 : programadoJid.get(jid) || 0,
    slotAlerta,
  });
  if (esAlerta) slotAlerta = enviarEn + TIEMPOS_WA.gapAlertaMs;
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
  };
  cola.push(job);
  return job;
}

async function despachar(job) {
  await sender(job.jid, job.text);
  if (!job.esAlerta) {
    programadoJid.set(job.jid, Math.max(programadoJid.get(job.jid) || 0, Date.now()));
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
  const job = tomar(false, Date.now());
  if (!job) return;
  enviandoChat = true;
  try {
    await despachar(job);
  } catch (e) {
    job.intentos = (job.intentos || 0) + 1;
    if (job.intentos < 3) {
      job.enviarEn = Date.now() + TIEMPOS_WA.gapChatMs;
      cola.push(job);
    } else {
      console.warn('[wa] no se pudo responder', job.jid, e.message);
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
      job.enviarEn = Date.now() + TIEMPOS_WA.gapChatMs;
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
