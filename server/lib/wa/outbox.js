import { registrarMensaje } from './repository.js';
import { TIEMPOS_WA, proximoEnvio, avanzarSlot } from './tiempos.js';

const cola = [];
let seq = 1;
let sender = null;
let timer = null;
let enviando = false;
let slotAlerta = 0;
let slotConversacion = 0;
const ultimoJid = new Map();
const ultimoInbound = new Map();

export function setWaSender(fn) {
  sender = fn;
}

export function marcarInbound(jid) {
  if (jid) ultimoInbound.set(jid, Date.now());
}

export function chatActivo(jid) {
  const t = ultimoInbound.get(jid) || 0;
  return t > 0 && Date.now() - t < TIEMPOS_WA.activoMs;
}

export function pendientePorJid(jid) {
  return cola.some((j) => j.jid === jid);
}

export function encolarTexto(jid, text, { esAlerta = false, contactoId = null, telefono = null, tipo = null } = {}) {
  if (!jid || !text) return null;
  const ahora = Date.now();
  const activo = !esAlerta && chatActivo(jid);
  const enviarEn = proximoEnvio({
    ahora,
    esAlerta,
    chatActivo: activo,
    ultimoJid: ultimoJid.get(jid) || 0,
    slotAlerta,
    slotConversacion,
  });
  if (esAlerta) slotAlerta = avanzarSlot(enviarEn, true);
  else if (!activo) slotConversacion = avanzarSlot(enviarEn, false);
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
  cola.sort((a, b) => a.enviarEn - b.enviarEn || a.id - b.id);
  return job;
}

async function drenar() {
  if (enviando || !sender) return;
  const ahora = Date.now();
  const idx = cola.findIndex((j) => j.enviarEn <= ahora);
  if (idx < 0) return;
  const job = cola.splice(idx, 1)[0];
  enviando = true;
  try {
    await sender(job.jid, job.text);
    ultimoJid.set(job.jid, Date.now());
    await registrarMensaje({
      contactoId: job.contactoId,
      telefono: job.telefono || job.jid.split('@')[0],
      direccion: 'out',
      texto: job.text,
      tipo: job.tipo || (job.esAlerta ? 'alerta' : 'chat'),
    }).catch(() => {});
  } catch (e) {
    job.intentos = (job.intentos || 0) + 1;
    if (job.intentos < 3) {
      job.enviarEn = Date.now() + TIEMPOS_WA.gapActivoMs;
      cola.push(job);
    } else {
      console.warn('[wa] no se pudo enviar', job.jid, e.message);
    }
  } finally {
    enviando = false;
  }
}

export function iniciarOutbox() {
  if (timer) return;
  timer = setInterval(() => {
    drenar().catch((e) => console.warn('[wa] outbox', e.message));
  }, TIEMPOS_WA.tickMs);
  timer.unref?.();
}

export function colaPendiente() {
  return cola.length;
}
