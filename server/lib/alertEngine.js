import nodemailer from 'nodemailer';
import {
  readJson,
  writeJson,
  uid,
  normalizeUmbrales,
  todayKey,
} from './store.js';
import { buildFueraDeRangoEmail } from './emailBuilder.js';
import { fetchAllDispositivos, deviceRowKey } from './telemetry.js';

const POLL_MINUTES = Number(process.env.CORREO_POLL_MINUTES ?? 2);

function getSmtp() {
  return readJson('smtp.json', null);
}

function getGrupos() {
  return readJson('grupos.json', []);
}

function getState() {
  return readJson('state.json', { daily: {}, inRangeSince: {} });
}

function saveState(state) {
  writeJson('state.json', state);
}

function getEnvios() {
  return readJson('envios.json', []);
}

function addEnvio(entry) {
  const all = getEnvios();
  all.unshift(entry);
  writeJson('envios.json', all.slice(0, 500));
  return entry;
}

function getIncidentes() {
  return readJson('incidentes.json', []);
}

function addIncidente(entry) {
  const all = getIncidentes();
  all.unshift(entry);
  writeJson('incidentes.json', all.slice(0, 1000));
  return entry;
}

function resolveLabels(assignment, dispositivo) {
  const desc = assignment.descripcionEquipo?.trim();
  const platform = desc || assignment.imei;
  return {
    dispositivoReeferId: desc || platform,
    nombrePlataforma: platform,
  };
}

function ensureDayBucket(state, rowKey, dayKey, nowIso) {
  if (!state.daily[rowKey]) state.daily[rowKey] = {};
  if (!state.daily[rowKey][dayKey]) {
    state.daily[rowKey][dayKey] = {
      minutesOut: 0,
      sentUmbrales: [],
      lastPollAt: nowIso,
    };
  }
  return state.daily[rowKey][dayKey];
}

function accumulateMinutes(state, rowKey, now) {
  const hoy = todayKey(now);
  const bucket = ensureDayBucket(state, rowKey, hoy, now.toISOString());
  const last = bucket.lastPollAt ? new Date(bucket.lastPollAt) : null;
  let delta = POLL_MINUTES;
  if (last && !Number.isNaN(last.getTime())) {
    delta = Math.round((now.getTime() - last.getTime()) / 60000);
    delta = Math.max(POLL_MINUTES, Math.min(delta, POLL_MINUTES * 3));
  }
  bucket.minutesOut += delta;
  bucket.lastPollAt = now.toISOString();
  return Math.floor(bucket.minutesOut / 60);
}

async function sendMail(smtp, to, content) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtp.user, pass: smtp.appPassword.replace(/\s/g, '') },
  });
  const info = await transporter.sendMail({
    from: `"${smtp.fromName || 'ZTRACK TELEMETRY'}" <${smtp.user}>`,
    to: to.join(', '),
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  return info.messageId;
}

export async function runAlertCycle() {
  const checkedAt = new Date().toISOString();
  const result = { checkedAt, devicesChecked: 0, emailsSent: 0, errors: [] };

  const smtp = getSmtp();
  if (!smtp?.user || !smtp?.appPassword) {
    return { ...result, skipped: 'smtp_not_configured' };
  }

  const grupos = getGrupos().filter((g) => g.enabled && g.emails?.length);
  if (grupos.length === 0) {
    return { ...result, skipped: 'no_groups' };
  }

  let dispositivos;
  try {
    dispositivos = await fetchAllDispositivos();
  } catch (e) {
    result.errors.push(e.message);
    return result;
  }

  const deviceMap = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));
  const state = getState();
  const now = new Date();
  const hoy = todayKey(now);

  for (const grupo of grupos) {
    for (const assignment of grupo.devices ?? []) {
      if (!assignment.enabled) continue;
      const dispositivo = deviceMap.get(assignment.rowKey);
      if (!dispositivo) continue;

      result.devicesChecked++;
      const enRango = dispositivo.en_rango;

      if (enRango === true) {
        state.inRangeSince[assignment.rowKey] = now.toISOString();
        continue;
      }

      if (enRango !== false) continue;

      const horasHoy = accumulateMinutes(state, assignment.rowKey, now);
      const bucket = state.daily[assignment.rowKey][hoy];
      const umbrales = normalizeUmbrales(assignment.umbralesHoras);
      const pending = umbrales.filter(
        (u) => horasHoy >= u && !bucket.sentUmbrales.includes(u)
      );

      if (pending.length === 0) continue;

      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      const tipoEvento = assignment.tipoEvento === 'mantenimiento' ? 'mantenimiento' : 'operaciones';

      for (const umbralHoras of pending) {
        const content = buildFueraDeRangoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasFueraRango: horasHoy,
          diaCalendario: hoy,
          hoy,
          tipoEvento,
        });

        const envioId = uid('envio');
        try {
          const messageId = await sendMail(smtp, grupo.emails, content);
          bucket.sentUmbrales.push(umbralHoras);

          addEnvio({
            id: envioId,
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            umbralHoras,
            horasFueraRango: horasHoy,
            diaCalendario: hoy,
            tipoEvento,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            messageId,
            success: true,
          });

          addIncidente({
            id: uid('inc'),
            envioId,
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            diaCalendario: hoy,
            umbralHoras,
            horasFueraRango: horasHoy,
            tipoEvento,
            estado: 'pendiente',
            subject: content.subject,
            destinatarios: [...grupo.emails],
            enviadoAt: new Date().toISOString(),
            comentarios: [],
          });

          result.emailsSent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`${dispositivoReeferId} ${umbralHoras}h: ${msg}`);
          addEnvio({
            id: envioId,
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            umbralHoras,
            horasFueraRango: horasHoy,
            diaCalendario: hoy,
            tipoEvento,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            success: false,
            error: msg,
          });
        }
      }
    }
  }

  saveState(state);
  writeJson('lastRun.json', result);
  return result;
}

export function getLastRun() {
  return readJson('lastRun.json', null);
}

export {
  getSmtp,
  getGrupos,
  getEnvios,
  getIncidentes,
  addIncidente,
};
