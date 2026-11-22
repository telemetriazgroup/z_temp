import { readJson, writeJson } from '../store.js';
import { formatDateTimeTz } from '../timezone.js';
import { resolveUserEffectiveImeis } from '../gruposEquiposRepository.js';
import { contactosAprobadosPorUsernames } from './repository.js';
import { encolarTexto } from './outbox.js';
import { jidDeTelefono } from './telefono.js';

const FILE = 'waControlFlota.json';

function clave(username, rowKey) {
  return `${String(username).trim().toLowerCase()}::${rowKey}`;
}

export function esCuentaFlotaCompleta(user) {
  if (!user) return false;
  if (user.superUser === true || user.category === 'superadmin') return true;
  if (user.category !== 'admin') return false;
  return resolveUserEffectiveImeis(user) == null;
}

export function rangoWhatsappDe(username, rowKey) {
  if (!username || !rowKey) return null;
  const all = readJson(FILE, {});
  const v = all[clave(username, rowKey)];
  if (!v || typeof v !== 'object') return null;
  return { rangoMin: margenGuardado(v.rangoMin), rangoMax: margenGuardado(v.rangoMax) };
}

export function leerControlDe(username) {
  const all = readJson(FILE, {});
  const prefix = `${String(username).trim().toLowerCase()}::`;
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(prefix)) continue;
    out[k.slice(prefix.length)] = {
      activo: v.activo === true,
      rango: 'normal',
      rangoMin: margenGuardado(v.rangoMin),
      rangoMax: margenGuardado(v.rangoMax),
      alerta30Minutos: v.alerta30Minutos === true,
      alerta1Hora: v.alerta1Hora === true,
    };
  }
  return out;
}

function margenGuardado(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 4;
  return Math.round(Math.min(30, Math.max(0, n)) * 10) / 10;
}

function margenPedido(valor, previo) {
  if (valor == null || valor === '') return margenGuardado(previo);
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 30) {
    throw new Error('El rango mínimo y el máximo van de 0 a 30 °C');
  }
  return Math.round(n * 10) / 10;
}

export function guardarControl({
  username,
  rowKey,
  imei,
  activo,
  alerta30Minutos,
  alerta1Hora,
  rangoMin,
  rangoMax,
}) {
  if (!rowKey) throw new Error('Falta el equipo');
  const all = readJson(FILE, {});
  const k = clave(username, rowKey);
  const prev = all[k] && typeof all[k] === 'object' ? all[k] : {};
  const min = margenPedido(rangoMin, prev.rangoMin);
  const max = margenPedido(rangoMax, prev.rangoMax);
  const cambioRango = min !== margenGuardado(prev.rangoMin) || max !== margenGuardado(prev.rangoMax);
  all[k] = {
    username: String(username),
    rowKey: String(rowKey),
    imei: imei || prev.imei || null,
    activo: activo === true,
    rango: 'normal',
    rangoMin: min,
    rangoMax: max,
    alerta30Minutos: alerta30Minutos === true,
    alerta1Hora: alerta1Hora === true,
    since: cambioRango ? null : prev.since || null,
    enviados: cambioRango ? [] : Array.isArray(prev.enviados) ? prev.enviados : [],
  };
  if (!all[k].activo) {
    all[k].enviados = [];
    all[k].since = null;
  }
  writeJson(FILE, all);
  return leerControlDe(username)[rowKey];
}

async function avisar(username, texto) {
  const contactos = await contactosAprobadosPorUsernames([username]);
  let n = 0;
  for (const c of contactos) {
    if (!c?.alertasHabilitadas || c.alertasPausadas) continue;
    const jid = jidDeTelefono(c.telefono);
    if (!jid) continue;
    encolarTexto(jid, texto, {
      esAlerta: true,
      contactoId: c.id,
      telefono: c.telefono,
      tipo: 'alerta',
    });
    n += 1;
  }
  return n;
}

function umbralesDe(pref) {
  const lista = [];
  if (pref.alerta30Minutos) lista.push(0.5);
  if (pref.alerta1Hora) lista.push(1);
  return lista;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function fueraDeSuRango(pref, setPoint, returnAir, enRango) {
  const min = margenGuardado(pref.rangoMin);
  const max = margenGuardado(pref.rangoMax);
  const sp = numero(setPoint);
  const ret = numero(returnAir);
  if (sp == null || ret == null) return { fuera: enRango === false, texto: `mín ${min} / máx ${max} °C sobre el set` };
  const bajo = Math.round((sp - min) * 10) / 10;
  const alto = Math.round((sp + max) * 10) / 10;
  return {
    fuera: ret < bajo || ret > alto,
    texto: `${bajo} a ${alto} °C (mín ${min} / máx ${max} respecto al set ${sp})`,
  };
}

/**
 * Aviso de WhatsApp de las cuentas con flota completa.
 * El rango mínimo y máximo de cada cuenta define lo normal. El correo no cambia.
 */
export async function sincronizarControlWhatsapp({
  rowKey,
  imei,
  nombre,
  codigo,
  enRango,
  setPoint = null,
  returnAir = null,
}) {
  if (!rowKey) return;
  const all = readJson(FILE, {});
  let cambio = false;
  const equipo = nombre || imei || rowKey;
  const ahora = Date.now();
  for (const pref of Object.values(all)) {
    if (!pref || pref.rowKey !== rowKey || pref.activo !== true) continue;
    const umbrales = umbralesDe(pref);
    if (!umbrales.length) continue;
    const banda = fueraDeSuRango(pref, setPoint, returnAir, enRango);
    if (!banda.fuera) {
      if (pref.enviados?.length || pref.since) {
        if (pref.enviados?.length && pref.since) {
          const horas = Math.round(((ahora - new Date(pref.since).getTime()) / 3600000) * 10) / 10;
          await avisar(
            pref.username,
            `*${equipo}*\nVolvió a rango.\nEstuvo fuera desde ${formatDateTimeTz(pref.since)} (${horas} h). El contador volvió a 0.\nRango normal: ${banda.texto}.`
          );
        }
        pref.enviados = [];
        pref.since = null;
        cambio = true;
      }
      continue;
    }
    if (!pref.since) {
      pref.since = new Date(ahora).toISOString();
      pref.enviados = [];
      cambio = true;
    }
    const horas = Math.round(((ahora - new Date(pref.since).getTime()) / 3600000) * 10) / 10;
    const ya = new Set(pref.enviados || []);
    const nuevos = umbrales.filter((u) => horas >= u && !ya.has(u));
    if (!nuevos.length) continue;
    const cual = nuevos.includes(1) ? '1 hora' : '30 minutos';
    await avisar(
      pref.username,
      `*${equipo}*\nFuera de rango desde ${formatDateTimeTz(pref.since)}.\nLleva ${horas} h. Aviso de ${cual}.\nRango normal: ${banda.texto}.`
    );
    pref.enviados = [...ya, ...nuevos];
    cambio = true;
  }
  if (cambio) writeJson(FILE, all);
}
