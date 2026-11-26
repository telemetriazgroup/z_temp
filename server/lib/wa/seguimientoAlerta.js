/**
 * Seguimiento que abre la alerta automática.
 * A las 2 h y 3 h el aviso es normal. A las 4 h y 5 h dice que continúa.
 * Los números marcados del grupo se etiquetan en cada aviso.
 * Desde las 6 h pide estatus, escucha 10 minutos y avisa una vez a ztrack@zgroup.com.pe.
 */
import nodemailer from 'nodemailer';
import { query } from '../db.js';
import { readJson, writeJson, uid } from '../store.js';
import { getSmtpConfig } from '../smtpRepository.js';
import { ensureWaSchema } from './schema.js';

const AVISOS = 'grupos_wa_avisos.json';
const CORREO_GRAVE = 'ztrack@zgroup.com.pe';
const ESCUCHA_NORMAL_MS = 3 * 60 * 1000;
const ESCUCHA_URGENTE_MS = 10 * 60 * 1000;

export function faseDeHoras(horas) {
  const h = Number(horas);
  if (!(h >= 4)) return 'normal';
  if (h < 6) return 'continuacion';
  return 'urgente';
}

export function minutosEscucha(fase) {
  return fase === 'urgente' ? 10 : 3;
}

export function textoFase(fase) {
  if (fase === 'continuacion') return 'La observación continúa.';
  if (fase === 'urgente') return 'La situación es urgente. Solicitamos el estatus de la atención.';
  return '';
}

export function motivoCierre(kind) {
  if (kind === 'apagado') return 'El equipo volvió a encenderse.';
  if (kind === 'fuera_linea' || kind === 'offline') return 'El equipo volvió a comunicar.';
  return 'Volvió a rango.';
}

function leerAvisos() {
  const raw = readJson(AVISOS, { episodios: {}, enviados: {}, suspendidos: {}, escuchas: [], graves: {}, abiertos: {} });
  if (!raw.episodios) raw.episodios = {};
  if (!raw.enviados) raw.enviados = {};
  if (!raw.suspendidos) raw.suspendidos = {};
  if (!Array.isArray(raw.escuchas)) raw.escuchas = [];
  if (!raw.graves) raw.graves = {};
  if (!raw.abiertos) raw.abiertos = {};
  return raw;
}

function guardarAvisos(avisos) {
  const fresco = readJson(AVISOS, {});
  if (fresco.suspendidos) avisos.suspendidos = fresco.suspendidos;
  writeJson(AVISOS, avisos);
}

export function alertaSuspendida(rowKey) {
  if (!rowKey) return false;
  return leerAvisos().suspendidos?.[rowKey]?.activo === true;
}

export function suspenderAlerta(rowKey, por) {
  if (!rowKey) return;
  const avisos = leerAvisos();
  avisos.suspendidos[rowKey] = { activo: true, por: por || 'admin', at: new Date().toISOString() };
  writeJson(AVISOS, avisos);
}

export function levantarSuspension(rowKey) {
  if (!rowKey) return;
  const avisos = leerAvisos();
  if (!avisos.suspendidos?.[rowKey]) return;
  delete avisos.suspendidos[rowKey];
  writeJson(AVISOS, avisos);
}

export function abrirVentanaGrupo({ jid, rowKey, fase, now = new Date() }) {
  if (!jid || !rowKey) return;
  const avisos = leerAvisos();
  const ahora = now.getTime();
  avisos.escuchas = avisos.escuchas.filter((e) => new Date(e.hasta).getTime() > ahora);
  const ms = fase === 'urgente' ? ESCUCHA_URGENTE_MS : ESCUCHA_NORMAL_MS;
  avisos.escuchas.push({
    jid,
    rowKey,
    hasta: new Date(ahora + ms).toISOString(),
  });
  guardarAvisos(avisos);
}

async function incidenteAbierto(rowKey) {
  const listo = await ensureWaSchema();
  if (!listo || !rowKey) return null;
  const r = await query(
    `SELECT id FROM wa_incidente
     WHERE row_key = $1 AND estado = 'seguimiento' AND origen = 'automatica'
     ORDER BY creado_en DESC LIMIT 1`,
    [rowKey]
  );
  return r.rows[0]?.id || null;
}

async function anotar(id, texto) {
  const nota = String(texto || '').trim();
  if (!id || nota.length < 2) return;
  await query(
    `INSERT INTO wa_incidente_nota (id, incidente_id, username, texto) VALUES ($1,$2,'sistema',$3)`,
    [uid('nota'), id, nota.slice(0, 500)]
  );
}

export async function registrarSeguimientoAlerta({ rowKey, imei, codigo, nombre, texto }) {
  const listo = await ensureWaSchema();
  if (!listo || !rowKey) return null;
  const detalle = String(texto || '').trim();
  if (detalle.length < 4) return null;
  const abierto = await incidenteAbierto(rowKey);
  if (abierto) {
    await anotar(abierto, detalle);
    return abierto;
  }
  const id = uid('inc');
  await query(
    `INSERT INTO wa_incidente
       (id, username, row_key, imei, codigo, nombre, tipo, descripcion, estado, origen)
     VALUES ($1,'sistema',$2,$3,$4,$5,'alerta_automatica',$6,'seguimiento','automatica')`,
    [id, rowKey, imei || null, codigo || null, nombre || null, detalle.slice(0, 500)]
  );
  return id;
}

export async function guardarMensajesDeVentana(jid, autor, texto) {
  const cuerpo = String(texto || '').trim();
  if (!jid || cuerpo.length < 2) return 0;
  const ahora = Date.now();
  const vivas = leerAvisos().escuchas.filter(
    (e) => e.jid === jid && new Date(e.hasta).getTime() > ahora
  );
  const claves = [...new Set(vivas.map((e) => e.rowKey).filter(Boolean))];
  if (!claves.length) return 0;
  const linea = `WhatsApp ${autor || 'grupo'}: ${cuerpo}`;
  let n = 0;
  for (const rowKey of claves) {
    const id = await incidenteAbierto(rowKey);
    if (!id) continue;
    await anotar(id, linea);
    n += 1;
  }
  return n;
}

export async function cerrarSeguimientoAutomatico(rowKey, solucion) {
  const listo = await ensureWaSchema();
  if (!listo || !rowKey) return 0;
  const cierre = String(solucion || 'Volvió a rango.').trim();
  const r = await query(
    `UPDATE wa_incidente
     SET estado = 'cerrado', solucion = $2, cerrado_en = now(), alerta_suspendida = false
     WHERE row_key = $1 AND estado = 'seguimiento' AND origen = 'automatica'`,
    [rowKey, cierre]
  );
  levantarSuspension(rowKey);
  const avisos = leerAvisos();
  let toco = false;
  if (avisos.graves?.[rowKey]) {
    delete avisos.graves[rowKey];
    toco = true;
  }
  if (avisos.abiertos?.[rowKey]) {
    delete avisos.abiertos[rowKey];
    toco = true;
  }
  if (toco) guardarAvisos(avisos);
  return r.rowCount || 0;
}

export async function suspenderSeguimiento({ id, username, activo }) {
  const listo = await ensureWaSchema();
  if (!listo) throw new Error('La base de incidentes no está disponible');
  const inc = await query(`SELECT * FROM wa_incidente WHERE id = $1`, [id]);
  const row = inc.rows[0];
  if (!row) throw new Error('No existe el incidente');
  if (row.estado !== 'seguimiento') throw new Error('El incidente ya está cerrado');
  if (activo) {
    suspenderAlerta(row.row_key, username);
    await query(`UPDATE wa_incidente SET alerta_suspendida = true WHERE id = $1`, [id]);
    await anotar(id, `${username || 'admin'} suspendió la alerta automática.`);
  } else {
    levantarSuspension(row.row_key);
    await query(
      `UPDATE wa_incidente SET alerta_suspendida = false WHERE row_key = $1 AND estado = 'seguimiento' AND origen = 'automatica'`,
      [row.row_key]
    );
    await anotar(id, `${username || 'admin'} reanudó la alerta automática.`);
  }
  return row.row_key;
}

async function enviarCorreo(subject, lineas) {
  const smtp = getSmtpConfig();
  if (!smtp?.user || !smtp?.appPassword) return false;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtp.user, pass: String(smtp.appPassword).replace(/\s/g, '') },
  });
  await transporter.sendMail({
    from: `"${smtp.fromName || 'ZTRACK TELEMETRY'}" <${smtp.user}>`,
    to: CORREO_GRAVE,
    subject,
    text: lineas.filter(Boolean).join('\n'),
  });
  return true;
}

export async function avisarSituacionGrave({ rowKey, nombre, imei, codigo, horas, since, kind }, avisosLocal) {
  if (!rowKey || alertaSuspendida(rowKey)) return false;
  const avisos = avisosLocal || leerAvisos();
  const actual = leerAvisos();
  if (actual.graves?.[rowKey] || avisos.graves?.[rowKey]) {
    if (actual.graves?.[rowKey]) avisos.graves[rowKey] = actual.graves[rowKey];
    return false;
  }
  const marca = new Date().toISOString();
  actual.graves[rowKey] = marca;
  writeJson(AVISOS, actual);
  avisos.graves[rowKey] = marca;
  const horasTxt = Number.isFinite(Number(horas)) ? `${Math.round(Number(horas) * 10) / 10} h` : 'más de 6 h';
  const enviado = await enviarCorreo(`ZTRACK · situación grave sin cambio · ${nombre || imei || rowKey}`, [
    `La observación de ${nombre || rowKey} lleva ${horasTxt} y no cambia.`,
    `Evento: ${kind || 'alerta'}`,
    `IMEI: ${imei || '—'}`,
    `API: ${codigo || '—'}`,
    since ? `Desde: ${since}` : '',
    'Se pidió el estatus de la atención en el grupo.',
    'El administrador puede suspender la alerta o escalar a gerencia.',
  ]).catch((e) => {
    console.warn('[wa] correo grave', e.message);
    return false;
  });
  if (!enviado) {
    delete avisos.graves[rowKey];
    const otra = leerAvisos();
    delete otra.graves[rowKey];
    writeJson(AVISOS, otra);
    return false;
  }
  await registrarSeguimientoAlerta({
    rowKey,
    imei,
    codigo,
    nombre,
    texto: `Situación grave (${horasTxt}). Se avisó a ${CORREO_GRAVE}.`,
  }).catch(() => {});
  return true;
}

export async function escalarSeguimiento({ id, username }) {
  const listo = await ensureWaSchema();
  if (!listo) throw new Error('La base de incidentes no está disponible');
  const inc = await query(`SELECT * FROM wa_incidente WHERE id = $1`, [id]);
  const row = inc.rows[0];
  if (!row) throw new Error('No existe el incidente');
  if (row.estado !== 'seguimiento') throw new Error('El incidente ya está cerrado');
  if (row.escalado_en) return row;
  await query(`UPDATE wa_incidente SET escalado_en = now() WHERE id = $1`, [id]);
  const enviado = await enviarCorreo(`ZTRACK · escalado a gerencia · ${row.nombre || row.imei || row.row_key}`, [
    `${username || 'admin'} escala a gerencia la alerta de ${row.nombre || row.row_key}.`,
    row.descripcion,
    `IMEI: ${row.imei || '—'}`,
    `API: ${row.codigo || '—'}`,
    'La situación no cambia. Hace falta evaluación de gerencia.',
  ]).catch((e) => {
    console.warn('[wa] escalar', e.message);
    return false;
  });
  await anotar(
    id,
    enviado
      ? `${username || 'admin'} escaló la alerta a gerencia. Se avisó a ${CORREO_GRAVE}.`
      : `${username || 'admin'} escaló la alerta a gerencia. El correo no salió.`
  );
  return row;
}
