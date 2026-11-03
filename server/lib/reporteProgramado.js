import nodemailer from 'nodemailer';
import { query } from './db.js';
import { readJson, writeJson, uid } from './store.js';
import { getSmtpConfig } from './smtpRepository.js';
import { getDeviceNameByImei } from './deviceNamesRepository.js';
import { getUserByUsername } from './usersRepository.js';
import { resolveUserEffectiveImeis } from './gruposEquiposRepository.js';

const FILE = 'reportesProgramados.json';
const PERIODOS = new Set([6, 8, 12, 24]);
const TZ = 'America/Lima';

function listRaw() {
  const rows = readJson(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function saveAll(rows) {
  writeJson(FILE, rows);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function limaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function limaSlotUtc(parts, hour, minute) {
  const iso = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}:00-05:00`;
  return new Date(iso);
}

export function slotKey(date) {
  const p = limaParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function isSlotHour(hour, anchor, period) {
  return ((hour - anchor + 24) % 24) % period === 0;
}

/** Próximos instantes de envío (GMT-5) a partir de ahora. */
export function upcomingSlots(schedule, count = 4, now = new Date()) {
  const period = Number(schedule.periodoHoras);
  const anchor = Number(schedule.horaEnvio);
  const minute = Number(schedule.minutoEnvio ?? 0);
  const out = [];
  const cursor = new Date(now.getTime() - 60_000);
  for (let i = 0; i < 24 * 4 && out.length < count; i++) {
    const t = new Date(cursor.getTime() + i * 60 * 60 * 1000);
    const p = limaParts(t);
    if (!isSlotHour(p.hour, anchor, period)) continue;
    const slot = limaSlotUtc(p, p.hour, minute);
    if (slot.getTime() <= now.getTime() - 60_000) continue;
    if (out.some((x) => x.getTime() === slot.getTime())) continue;
    out.push(slot);
  }
  return out;
}

/**
 * Si ahora cae en los 10 minutos posteriores a un slot y aún no se envió, devuelve la clave.
 */
function slotOn(parts, hour, minute) {
  const key = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}`;
  return { key, end: limaSlotUtc(parts, hour, minute) };
}

export function dueSlot(schedule, now = new Date()) {
  if (schedule?.enabled !== true) return null;
  const period = Number(schedule.periodoHoras);
  const anchor = Number(schedule.horaEnvio);
  const minute = Number(schedule.minutoEnvio ?? 0);
  if (!PERIODOS.has(period)) return null;
  const candidates = [now, new Date(now.getTime() - 60 * 60 * 1000)];
  for (const instant of candidates) {
    const p = limaParts(instant);
    if (!isSlotHour(p.hour, anchor, period)) continue;
    const slot = slotOn(p, p.hour, minute);
    const late = now.getTime() - slot.end.getTime();
    if (late < 0 || late > 10 * 60 * 1000) continue;
    if (schedule.lastSentSlot === slot.key) return null;
    return slot;
  }
  return null;
}

function parseEmails(value) {
  const list = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[,;\s]+/)
        .filter(Boolean);
  const emails = [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter((e) => /@/.test(e)))];
  if (!emails.length) throw new Error('Indique al menos un correo destinatario');
  return emails;
}

export function normalizeSchedule(input, prev = {}) {
  const periodo = Number(input.periodoHoras ?? prev.periodoHoras);
  if (!PERIODOS.has(periodo)) {
    throw new Error('El período debe ser 6, 8, 12 o 24 horas');
  }
  const hora = Number(input.horaEnvio ?? prev.horaEnvio);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    throw new Error('La hora de envío debe estar entre 0 y 23');
  }
  const minutoRaw = input.minutoEnvio ?? prev.minutoEnvio ?? 0;
  const minuto = Number(minutoRaw);
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
    throw new Error('El minuto de envío debe estar entre 0 y 59');
  }
  const alcance = input.alcance === 'asignada' || prev.alcance === 'asignada' ? 'asignada' : 'completa';
  const now = new Date().toISOString();
  return {
    id: prev.id || input.id || uid('reporte'),
    nombre: String(input.nombre ?? prev.nombre ?? '').trim() || `Comportamiento ${periodo}h`,
    cliente: String(input.cliente ?? prev.cliente ?? '').trim(),
    emails: parseEmails(input.emails ?? prev.emails),
    periodoHoras: periodo,
    horaEnvio: hora,
    minutoEnvio: minuto,
    alcance: input.alcance != null ? (input.alcance === 'asignada' ? 'asignada' : 'completa') : alcance,
    enabled: input.enabled != null ? input.enabled === true : prev.enabled !== false,
    ownerUsername: prev.ownerUsername || input.ownerUsername || null,
    lastSentSlot: prev.lastSentSlot ?? null,
    lastSentAt: prev.lastSentAt ?? null,
    lastError: prev.lastError ?? null,
    createdAt: prev.createdAt || now,
    updatedAt: now,
  };
}

export function listSchedules() {
  return listRaw();
}

export function visibleSchedules(actor) {
  const all = listRaw();
  if (!actor) return [];
  if (actor.superUser === true || actor.category === 'superadmin') return all;
  const key = String(actor.username ?? '').toLowerCase();
  return all.filter((s) => String(s.ownerUsername ?? '').toLowerCase() === key);
}

export function saveSchedule(input, actor) {
  const rows = listRaw();
  const prev = input.id ? rows.find((s) => s.id === input.id) : null;
  if (input.id && !prev) throw new Error('Reporte no encontrado');
  if (prev && actor && actor.superUser !== true && actor.category !== 'superadmin') {
    if (String(prev.ownerUsername ?? '').toLowerCase() !== String(actor.username).toLowerCase()) {
      throw new Error('No puede editar este reporte');
    }
  }
  const actorFull =
    !actor || actor.superUser === true || actor.category === 'superadmin' ||
    (Array.isArray(actor.deviceAccess) && actor.deviceAccess.includes('all'));
  const alcancePedida =
    input.alcance != null
      ? input.alcance === 'asignada'
        ? 'asignada'
        : 'completa'
      : prev?.alcance === 'asignada'
        ? 'asignada'
        : 'completa';
  if (alcancePedida === 'completa' && actor && !actorFull) {
    throw new Error('Solo una cuenta con flota completa puede programar el reporte de toda la flota');
  }
  const next = normalizeSchedule(
    { ...input, ownerUsername: prev?.ownerUsername || actor?.username || null },
    prev ?? {}
  );
  if (!actorFull) next.alcance = 'asignada';
  const idx = rows.findIndex((s) => s.id === next.id);
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  saveAll(rows);
  return withPreview(next);
}

export function deleteSchedule(id, actor) {
  const rows = listRaw();
  const prev = rows.find((s) => s.id === id);
  if (!prev) return false;
  if (actor && actor.superUser !== true && actor.category !== 'superadmin') {
    if (String(prev.ownerUsername ?? '').toLowerCase() !== String(actor.username).toLowerCase()) {
      throw new Error('No puede eliminar este reporte');
    }
  }
  saveAll(rows.filter((s) => s.id !== id));
  return true;
}

function withPreview(schedule) {
  const next = upcomingSlots(schedule, 3);
  return {
    ...schedule,
    proximosEnvios: next.map((d) => d.toISOString()),
  };
}

export function listSchedulesPublic(actor) {
  return visibleSchedules(actor).map(withPreview);
}

function imeisForSchedule(schedule) {
  if (schedule.alcance !== 'asignada') return null;
  const owner = schedule.ownerUsername ? getUserByUsername(schedule.ownerUsername) : null;
  if (!owner) return [];
  return resolveUserEffectiveImeis(owner);
}

function horasDeMuestras(n) {
  return Math.round((Number(n) * 5) / 6) / 10;
}

export async function buildComportamiento({ desde, hasta, imeis = null }) {
  const params = [desde.toISOString(), hasta.toISOString()];
  let filter = '';
  if (Array.isArray(imeis)) {
    params.push(imeis);
    filter = ' AND imei = ANY($3::text[])';
  }
  const r = await query(
    `SELECT
       imei,
       codigo,
       row_key,
       COUNT(*)::int AS muestras,
       COUNT(*) FILTER (WHERE estado_conexion = 'online')::int AS online,
       COUNT(*) FILTER (WHERE estado_conexion = 'wait')::int AS wait,
       COUNT(*) FILTER (WHERE estado_conexion = 'offline')::int AS offline,
       COUNT(*) FILTER (WHERE rango_estado = 'normal')::int AS en_rango,
       COUNT(*) FILTER (WHERE rango_estado = 'fuera')::int AS fuera,
       COUNT(*) FILTER (WHERE rango_estado = 'apagado')::int AS apagado,
       COUNT(*) FILTER (WHERE en_defrost IS TRUE)::int AS defrost
     FROM dashboard_device_sample
     WHERE captured_at >= $1 AND captured_at < $2
     ${filter}
     GROUP BY imei, codigo, row_key
     ORDER BY offline DESC, fuera DESC, imei`,
    params
  );
  const equipos = r.rows.map((row) => ({
    imei: row.imei,
    codigo: row.codigo,
    rowKey: row.row_key,
    nombre: getDeviceNameByImei(row.imei) || row.imei,
    muestras: row.muestras,
    horasOnline: horasDeMuestras(row.online),
    horasWait: horasDeMuestras(row.wait),
    horasOffline: horasDeMuestras(row.offline),
    horasEnRango: horasDeMuestras(row.en_rango),
    horasFuera: horasDeMuestras(row.fuera),
    horasApagado: horasDeMuestras(row.apagado),
    horasDefrost: horasDeMuestras(row.defrost),
  }));
  const sum = (key) => Math.round(equipos.reduce((s, e) => s + e[key], 0) * 10) / 10;
  return {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    equipos: equipos.length,
    muestras: equipos.reduce((s, e) => s + e.muestras, 0),
    horasOnline: sum('horasOnline'),
    horasWait: sum('horasWait'),
    horasOffline: sum('horasOffline'),
    horasEnRango: sum('horasEnRango'),
    horasFuera: sum('horasFuera'),
    horasApagado: sum('horasApagado'),
    horasDefrost: sum('horasDefrost'),
    detalle: equipos,
  };
}

function fmtLima(iso) {
  return new Date(iso).toLocaleString('es-PE', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderEmail(schedule, report) {
  const top = report.detalle.slice(0, 15);
  const lines = top.map(
    (e) =>
      `${e.nombre} (${e.codigo ?? '—'} ${e.imei}): offline ${e.horasOffline} h · wait ${e.horasWait} h · fuera ${e.horasFuera} h · apagado ${e.horasApagado} h · en rango ${e.horasEnRango} h`
  );
  const cliente = schedule.cliente ? ` · ${schedule.cliente}` : '';
  const subject = `ZTRACK · Comportamiento ${schedule.periodoHoras}h${cliente} · ${fmtLima(report.hasta)}`;
  const text = [
    `Reporte de comportamiento (distinto de las alertas de incidente).`,
    `Ventana: ${fmtLima(report.desde)} → ${fmtLima(report.hasta)} (GMT-5).`,
    `Calculado con las muestras guardadas cada 5 minutos.`,
    ``,
    `Equipos: ${report.equipos}`,
    `Muestras: ${report.muestras}`,
    `Horas-equipo online: ${report.horasOnline}`,
    `Horas-equipo wait: ${report.horasWait}`,
    `Horas-equipo offline: ${report.horasOffline}`,
    `Horas-equipo en rango: ${report.horasEnRango}`,
    `Horas-equipo fuera de rango: ${report.horasFuera}`,
    `Horas-equipo apagado: ${report.horasApagado}`,
    `Horas-equipo defrost: ${report.horasDefrost}`,
    ``,
    top.length ? 'Equipos con más tiempo offline o fuera de rango:' : 'Sin muestras en esta ventana.',
    ...lines,
  ].join('\n');
  const rows = top
    .map(
      (e) =>
        `<tr><td>${e.nombre}</td><td>${e.horasOffline}</td><td>${e.horasWait}</td><td>${e.horasFuera}</td><td>${e.horasApagado}</td><td>${e.horasEnRango}</td></tr>`
    )
    .join('');
  const html = `<div style="font-family:sans-serif;font-size:14px">
    <p><strong>Reporte de comportamiento</strong> · últimas ${schedule.periodoHoras} h. No reemplaza las alertas de incidente.</p>
    <p>${fmtLima(report.desde)} → ${fmtLima(report.hasta)} (GMT-5). Muestras acumuladas cada 5 minutos.</p>
    <ul>
      <li>Equipos: ${report.equipos} · muestras: ${report.muestras}</li>
      <li>Online ${report.horasOnline} h · wait ${report.horasWait} h · offline ${report.horasOffline} h</li>
      <li>En rango ${report.horasEnRango} h · fuera ${report.horasFuera} h · apagado ${report.horasApagado} h · defrost ${report.horasDefrost} h</li>
    </ul>
    ${
      rows
        ? `<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse"><thead><tr><th>Equipo</th><th>Offline h</th><th>Wait h</th><th>Fuera h</th><th>Apagado h</th><th>En rango h</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p>Sin muestras en esta ventana.</p>'
    }
  </div>`;
  return { subject, text, html };
}

async function deliver(schedule, report) {
  const cfg = getSmtpConfig();
  if (!cfg?.user || !cfg?.appPassword) {
    throw new Error('SMTP no configurado');
  }
  const { subject, text, html } = renderEmail(schedule, report);
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cfg.user, pass: String(cfg.appPassword).replace(/\s/g, '') },
  });
  const info = await transporter.sendMail({
    from: `"${cfg.fromName || 'ZTRACK TELEMETRY'}" <${cfg.user}>`,
    to: schedule.emails.join(', '),
    subject,
    text,
    html,
  });
  return { messageId: info.messageId, subject };
}

async function sendSchedule(schedule, { end, slotKey: key, manual = false }) {
  const start = new Date(end.getTime() - Number(schedule.periodoHoras) * 3600_000);
  const imeis = imeisForSchedule(schedule);
  const report = await buildComportamiento({ desde: start, hasta: end, imeis });
  const sent = await deliver(schedule, report);
  const rows = listRaw();
  const idx = rows.findIndex((s) => s.id === schedule.id);
  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      lastSentAt: new Date().toISOString(),
      lastError: null,
      ...(manual ? {} : { lastSentSlot: key }),
    };
    saveAll(rows);
  }
  return { ...sent, report: { ...report, detalle: report.detalle.slice(0, 15) } };
}

export async function sendScheduleNow(id) {
  const schedule = listRaw().find((s) => s.id === id);
  if (!schedule) throw new Error('Reporte no encontrado');
  const end = new Date();
  return sendSchedule(schedule, { end, slotKey: null, manual: true });
}

let ticking = false;

export async function tickReportesProgramados(now = new Date()) {
  if (ticking) return [];
  ticking = true;
  const sent = [];
  try {
    for (const schedule of listRaw()) {
      const due = dueSlot(schedule, now);
      if (!due) continue;
      try {
        const result = await sendSchedule(schedule, { end: due.end, slotKey: due.key });
        sent.push({ id: schedule.id, ok: true, subject: result.subject });
        console.log('[reporte] enviado', schedule.id, result.subject);
      } catch (e) {
        const rows = listRaw();
        const idx = rows.findIndex((s) => s.id === schedule.id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], lastError: e.message, updatedAt: new Date().toISOString() };
          saveAll(rows);
        }
        console.warn('[reporte]', schedule.id, e.message);
        sent.push({ id: schedule.id, ok: false, error: e.message });
      }
    }
  } finally {
    ticking = false;
  }
  return sent;
}
