import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { readJson, writeJson, uid } from '../store.js';
import { getSmtpConfig } from '../smtpRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { filterDispositivosForUser } from '../dashboard/snapshot.js';
import { getDeviceNameByRowKey, tieneNombreEnOtraFamilia } from '../deviceNamesRepository.js';
import { isSuperAdminUser } from '../usersRepository.js';
import { drivePublicView } from '../driveCredentials.js';
import { planCarpetas } from './cortesCampaña.js';
import { archivarEnDrive, crearCarpetasCampaña, subirPdf } from './driveCarpetas.js';
import { generarInformeSync } from './generador.js';

const UMBRAL_HORAS_FUERA = 5;
const CORREO_ZTRACK = 'ztrack@zgroup.com.pe';
const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../informe/engine');
const INFORMES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/informes');

const FILE = 'campanasInformes.json';
const RUNS = 'campanasInformesRuns.json';
const TZ = 'America/Lima';

let busy = false;

function listRaw() {
  const rows = readJson(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function saveCampanas(rows) {
  writeJson(FILE, rows);
}

function listRuns() {
  const rows = readJson(RUNS, []);
  return Array.isArray(rows) ? rows : [];
}

function saveRuns(rows) {
  writeJson(RUNS, rows);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function limaNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** 1 = lunes … 7 = domingo, en el calendario de Lima. */
function diaSemanaDe(now) {
  const utc = new Date(Date.UTC(now.year, now.month - 1, now.day));
  return ((utc.getUTCDay() + 6) % 7) + 1;
}

function isoUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Semana de lunes a domingo ya cerrada. El domingo incluye la semana que termina ese día. */
function semanaAnterior(now = limaNow()) {
  const utc = new Date(Date.UTC(now.year, now.month - 1, now.day));
  const dow = utc.getUTCDay();
  const sunday = new Date(utc);
  if (dow !== 0) sunday.setUTCDate(utc.getUTCDate() - dow);
  const monday = new Date(sunday);
  monday.setUTCDate(sunday.getUTCDate() - 6);
  const desde = isoUtc(monday);
  return { desde, hasta: isoUtc(sunday), clave: desde };
}

function nombreTelemetria(actor, device) {
  const perfil = actor?.deviceNames?.[device.imei];
  if (typeof perfil === 'string' && perfil.trim() && perfil.trim().toUpperCase() !== 'SIN ASIGNAR') {
    return perfil.trim();
  }
  const rowKey = device.codigo ? `${String(device.codigo).toUpperCase()}-${device.imei}` : device.imei;
  return getDeviceNameByRowKey(rowKey) || getDeviceNameByImei(device.imei) || null;
}

function parseEmails(input, requerido = true) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[,;\s]+/);
  const emails = [
    ...new Set(
      raw
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    ),
  ];
  if (!emails.length && requerido) throw new Error('Indique al menos un correo del comercial');
  return emails;
}

function correosAdmin(campana) {
  const lista = Array.isArray(campana.emailsAdmin) ? campana.emailsAdmin.filter(Boolean) : [];
  return lista.length ? lista : [CORREO_ZTRACK];
}

function rangoDe(campana, now = limaNow()) {
  if (campana.periodo === 'semana_anterior') return semanaAnterior(now);
  if (campana.periodo === 'rango') {
    return { desde: campana.desde, hasta: campana.hasta, clave: `${now.year}-${pad(now.month)}` };
  }
  let year = now.year;
  let month = now.month - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    desde: `${year}-${pad(month)}-01`,
    hasta: `${year}-${pad(month)}-${pad(last)}`,
    clave: `${year}-${pad(month)}`,
  };
}

async function equiposValidos(actor, input) {
  const all = await loadCurrentDispositivos();
  const visibles = filterDispositivosForUser(all, actor);
  const items = Array.isArray(input) ? input : [];
  if (!items.length) throw new Error('Seleccione al menos un equipo');
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const imei = String(item?.imei ?? '').trim();
    const codigo = String(item?.codigo ?? '').trim().toUpperCase();
    const key = `${codigo}|${imei}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const device = visibles.find(
      (d) => String(d.imei) === imei && String(d.codigo ?? '').toUpperCase() === codigo
    );
    if (!device) throw new Error(`El equipo ${imei || codigo} no está en su flota`);
    const ligado = nombreTelemetria(actor, device);
    const nombre = ligado || String(item?.nombre ?? '').trim();
    if (!nombre || nombre.toUpperCase() === 'SIN ASIGNAR') {
      throw new Error(`Indique el nombre del informe para ${codigo} ${imei}`);
    }
    out.push({ imei, codigo, nombre });
  }
  return out;
}

function puedeVer(actor, campana) {
  return isSuperAdminUser(actor) || campana.owner === actor.username;
}

function publica(campana, runs) {
  const propias = runs.filter((r) => r.campanaId === campana.id);
  const ultima = propias[propias.length - 1] ?? null;
  return {
    ...campana,
    ultimaCorrida: ultima
      ? {
          id: ultima.id,
          estado: ultima.estado,
          desde: ultima.desde,
          hasta: ultima.hasta,
          clienteCarpetaUrl: ultima.clienteCarpetaUrl ?? null,
        }
      : null,
  };
}

export function listCampanas(actor) {
  const runs = listRuns();
  return listRaw()
    .filter((c) => puedeVer(actor, c))
    .map((c) => publica(c, runs));
}

export async function guardarCampana(actor, input, id) {
  const rows = listRaw();
  const prev = id ? rows.find((c) => c.id === id) : null;
  if (id && (!prev || !puedeVer(actor, prev))) throw new Error('Campaña no encontrada');
  const cliente = String(input?.cliente ?? '').trim();
  if (!cliente) throw new Error('Indique el cliente');
  const periodos = ['semana_anterior', 'mes_anterior', 'rango'];
  const periodo = periodos.includes(input?.periodo) ? input.periodo : 'semana_anterior';
  const programaciones = ['semanal', 'manual', 'mensual'];
  const programacion = programaciones.includes(input?.programacion)
    ? input.programacion
    : input?.activo === false
      ? 'manual'
      : 'mensual';
  const dia = Number(input?.dia ?? prev?.dia ?? 1);
  const diaSemana = Number(input?.diaSemana ?? prev?.diaSemana ?? 1);
  const hora = Number(input?.hora);
  const minuto = Number(input?.minuto ?? 0);
  if (programacion === 'semanal') {
    if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) {
      throw new Error('Elija el día de la semana');
    }
  } else if (programacion === 'mensual') {
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new Error('El día debe estar entre 1 y 28');
  }
  if (programacion !== 'manual') {
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) throw new Error('Hora inválida');
    if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) throw new Error('Minuto inválido');
  }
  let desde = null;
  let hasta = null;
  if (periodo === 'rango') {
    desde = String(input?.desde ?? '').trim();
    hasta = String(input?.hasta ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      throw new Error('Indique un rango de fechas válido');
    }
  }
  const equipos = await equiposValidos(actor, input?.equipos);
  const ahora = new Date().toISOString();
  const next = {
    id: prev?.id ?? uid('camp'),
    cliente,
    equipos,
    periodo,
    desde,
    hasta,
    programacion,
    dia,
    diaSemana,
    hora,
    minuto,
    emails: parseEmails(input?.emails, true),
    emailsAdmin: parseEmails(input?.emailsAdmin, false),
    tolerancia: Number(input?.tolerancia ?? prev?.tolerancia ?? 9) || 9,
    idioma: 'es',
    reconstruir: input?.reconstruir !== false,
    activo: programacion !== 'manual',
    ultimoPeriodo: prev?.ultimoPeriodo ?? null,
    owner: prev?.owner ?? actor.username,
    createdAt: prev?.createdAt ?? ahora,
    updatedAt: ahora,
  };
  const idx = rows.findIndex((c) => c.id === next.id);
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  saveCampanas(rows);
  return publica(next, listRuns());
}

export function borrarCampana(actor, id) {
  const rows = listRaw();
  const prev = rows.find((c) => c.id === id);
  if (!prev || !puedeVer(actor, prev)) throw new Error('Campaña no encontrada');
  const activa = listRuns().some(
    (r) => r.campanaId === id && ['pendiente', 'generando', 'enviando'].includes(r.estado)
  );
  if (activa) throw new Error('Hay una corrida en curso. Espere a que termine.');
  saveCampanas(rows.filter((c) => c.id !== id));
}

function vistaCorrida(run, actor) {
  const tareas = run.tareas ?? [];
  const verRetenidos = actor && isSuperAdminUser(actor);
  return {
    id: run.id,
    campanaId: run.campanaId,
    desde: run.desde,
    hasta: run.hasta,
    manual: Boolean(run.manual),
    estado: run.estado,
    clienteCarpetaUrl: run.clienteCarpetaUrl ?? null,
    mailMessageId: run.mailMessageId ?? null,
    mailError: run.mailError ?? null,
    resumenUrl: run.resumenUrl ?? null,
    urgenteError: verRetenidos ? run.urgenteError ?? null : null,
    avance: {
      total: tareas.length,
      subido: tareas.filter((t) => t.estado === 'subido').length,
      error: tareas.filter((t) => t.estado === 'error').length,
      sinDatos: tareas.filter((t) => t.estado === 'sin_datos').length,
      pendiente: tareas.filter((t) => t.estado === 'pendiente' || t.estado === 'pdf_listo').length,
    },
    tareas: tareas.map((t) => ({
      imei: t.imei,
      codigo: t.codigo,
      nombre: t.nombre,
      desde: t.desde,
      hasta: t.hasta,
      ruta: t.ruta,
      estado: t.estado,
      error: t.error ?? null,
      carpetaUrl: t.carpetaUrl ?? null,
      horasFuera: t.horasFuera ?? null,
      horasDefrost: t.horasDefrost ?? null,
      horasFueraTotal: t.horasFueraTotal ?? null,
      dias: (t.dias ?? [])
        .filter((d) => verRetenidos || !d.pendiente)
        .map((d) =>
          verRetenidos
            ? d
            : { dia: d.dia, pendiente: false }
        ),
    })),
  };
}

export function listCorridas(actor, campanaId) {
  const campana = listRaw().find((c) => c.id === campanaId);
  if (!campana || !puedeVer(actor, campana)) throw new Error('Campaña no encontrada');
  return listRuns()
    .filter((r) => r.campanaId === campanaId)
    .map((r) => vistaCorrida(r, actor));
}

export function getCorrida(actor, runId) {
  const run = listRuns().find((r) => r.id === runId);
  if (!run) throw new Error('Corrida no encontrada');
  const campana = listRaw().find((c) => c.id === run.campanaId);
  if (!campana || !puedeVer(actor, campana)) throw new Error('Corrida no encontrada');
  return vistaCorrida(run, actor);
}

function armarTareas(cliente, desde, hasta, equipos) {
  const cortes = planCarpetas(cliente, desde, hasta);
  const tareas = [];
  for (const equipo of equipos) {
    for (const corte of cortes) {
      tareas.push({
        imei: equipo.imei,
        codigo: equipo.codigo,
        nombre: equipo.nombre,
        desde: corte.desde,
        hasta: corte.hasta,
        ruta: corte.ruta,
        mesCarpeta: corte.mesCarpeta,
        semanaCarpeta: corte.semanaCarpeta,
        estado: 'pendiente',
        error: null,
        archivo: null,
        driveFileId: null,
        carpetaId: null,
        carpetaUrl: null,
      });
    }
  }
  return tareas;
}

function persistRun(run) {
  const rows = listRuns().filter((r) => r.id !== run.id);
  rows.push(run);
  const terminal = rows.filter((r) => ['enviado', 'error'].includes(r.estado));
  const vivos = rows.filter((r) => !['enviado', 'error'].includes(r.estado));
  saveRuns([...terminal.slice(-80), ...vivos]);
}

export async function lanzarCampana(actor, id) {
  const campana = listRaw().find((c) => c.id === id);
  if (!campana || !puedeVer(actor, campana)) throw new Error('Campaña no encontrada');
  const ocupada = listRuns().some(
    (r) =>
      r.campanaId === id && ['pendiente', 'generando', 'enviando', 'error_correo'].includes(r.estado)
  );
  if (ocupada) throw new Error('Esta campaña ya tiene una corrida en curso');
  const now = limaNow();
  const rango = rangoDe(campana, now);
  const run = {
    id: uid('run'),
    campanaId: campana.id,
    desde: rango.desde,
    hasta: rango.hasta,
    periodoClave: null,
    manual: true,
    estado: 'pendiente',
    tareas: armarTareas(campana.cliente, rango.desde, rango.hasta, campana.equipos),
    clienteCarpetaUrl: null,
    mailMessageId: null,
    mailError: null,
    createdAt: new Date().toISOString(),
  };
  persistRun(run);
  void tickCampanas();
  return vistaCorrida(run, actor);
}

function campanaVencida(now) {
  const minutos = now.hour * 60 + now.minute;
  const diaSemana = diaSemanaDe(now);
  for (const campana of listRaw()) {
    if (!campana.activo || campana.programacion === 'manual') continue;
    const semanal = campana.programacion === 'semanal';
    if (semanal) {
      if (diaSemana !== Number(campana.diaSemana)) continue;
    } else if (now.day !== campana.dia) {
      continue;
    }
    const marca = campana.hora * 60 + campana.minuto;
    const delta = minutos - marca;
    if (delta < 0 || delta > 10) continue;
    const rango = semanal ? semanaAnterior(now) : rangoDe(campana, now);
    if (campana.ultimoPeriodo === rango.clave) continue;
    const ocupada = listRuns().some(
      (r) =>
        r.campanaId === campana.id &&
        ['pendiente', 'generando', 'enviando', 'error_correo'].includes(r.estado)
    );
    if (ocupada) continue;
    return { campana, rango };
  }
  return null;
}

function encolarProgramada(campana, rango) {
  const run = {
    id: uid('run'),
    campanaId: campana.id,
    desde: rango.desde,
    hasta: rango.hasta,
    periodoClave: rango.clave,
    manual: false,
    estado: 'pendiente',
    tareas: armarTareas(campana.cliente, rango.desde, rango.hasta, campana.equipos),
    clienteCarpetaUrl: null,
    mailMessageId: null,
    mailError: null,
    createdAt: new Date().toISOString(),
  };
  persistRun(run);
  return run;
}

function esSinDatos(mensaje) {
  return /No hay telemetr[ií]a oficial|no tiene datos termicos|No hay telemetría en este periodo/i.test(
    String(mensaje || '')
  );
}

async function pdfSinDatos(tarea) {
  fs.mkdirSync(INFORMES_DIR, { recursive: true });
  const base = nombrePdf(tarea.nombre, tarea.desde, tarea.hasta).replace(/^Informe_/, 'SinDatos_');
  const salida = path.join(INFORMES_DIR, `${tarea.imei}-${base}`);
  const specPath = `${salida}.json`;
  fs.writeFileSync(
    specPath,
    JSON.stringify({
      salida,
      nombre: tarea.nombre,
      desde: tarea.desde,
      hasta: tarea.hasta,
    })
  );
  await new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(ENGINE_DIR, 'aviso_pdf.py'), specPath], { cwd: ENGINE_DIR });
    let err = '';
    child.stderr.on('data', (b) => {
      err += b.toString();
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `sin datos ${code}`))));
  });
  return { nombre: base, ruta: salida };
}

function nombrePdf(nombre, desde, hasta) {
  const base =
    String(nombre)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'equipo';
  return `Informe_${base}_${desde}_${hasta}.pdf`;
}

async function asegurarDestinos(run, campana) {
  const falta = run.tareas.some((t) => !t.carpetaId);
  if (!falta && run.clienteCarpetaUrl) return;
  const rootId = drivePublicView().folderId;
  if (!rootId) throw new Error('Falta la carpeta general de Drive');
  const creadas = await crearCarpetasCampaña({
    cliente: campana.cliente,
    desde: run.desde,
    hasta: run.hasta,
    rootId,
  });
  run.clienteCarpetaUrl = creadas.clienteCarpetaUrl;
  run.clienteCarpetaId = creadas.clienteCarpetaId;
  const byKey = new Map(creadas.cortes.map((c) => [`${c.ruta}|${c.desde}`, c]));
  for (const tarea of run.tareas) {
    const corte = byKey.get(`${tarea.ruta}|${tarea.desde}`);
    if (!corte) continue;
    tarea.carpetaId = corte.carpetaId;
    tarea.carpetaUrl = corte.carpetaUrl;
  }
}

function transporterDe() {
  const cfg = getSmtpConfig();
  if (!cfg?.user || !cfg?.appPassword) throw new Error('SMTP no configurado');
  return {
    cfg,
    transporter: nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: cfg.user, pass: String(cfg.appPassword).replace(/\s/g, '') },
    }),
  };
}

function diasPendientes(run) {
  const filas = [];
  for (const t of run.tareas ?? []) {
    for (const d of t.dias ?? []) {
      if (d.pendiente) filas.push({ ...d, nombre: t.nombre, codigo: t.codigo, imei: t.imei });
    }
  }
  return filas;
}

async function publicarResumen(run, campana) {
  if (!run.clienteCarpetaId) return;
  const porEquipo = new Map();
  for (const t of run.tareas ?? []) {
    if (t.estado !== 'subido') continue;
    const cur = porEquipo.get(`${t.codigo}|${t.imei}`) ?? {
      nombre: t.nombre,
      horas_sin_defrost: 0,
      horas_total: 0,
      dias: 0,
    };
    cur.horas_sin_defrost += Number(t.horasFuera || 0);
    cur.horas_total += Number(t.horasFueraTotal || 0);
    cur.dias += (t.dias ?? []).filter((d) => !d.pendiente).length;
    porEquipo.set(`${t.codigo}|${t.imei}`, cur);
  }
  const filas = [...porEquipo.values()];
  if (!filas.length) return;
  fs.mkdirSync(INFORMES_DIR, { recursive: true });
  const salida = path.join(INFORMES_DIR, `Resumen_${run.id}.pdf`);
  const specPath = path.join(INFORMES_DIR, `Resumen_${run.id}.json`);
  const totalSin = filas.reduce((s, f) => s + f.horas_sin_defrost, 0);
  const total = filas.reduce((s, f) => s + f.horas_total, 0);
  fs.writeFileSync(
    specPath,
    JSON.stringify({
      salida,
      cliente: campana.cliente,
      desde: run.desde,
      hasta: run.hasta,
      filas,
      total_sin_defrost: totalSin,
      total,
    })
  );
  await new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(ENGINE_DIR, 'resumen_campana.py'), specPath], {
      cwd: ENGINE_DIR,
    });
    let err = '';
    child.stderr.on('data', (b) => {
      err += b.toString();
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `resumen ${code}`))));
  });
  if (run.resumenDriveId) await archivarEnDrive(run.resumenDriveId).catch(() => {});
  const subido = await subirPdf(
    run.clienteCarpetaId,
    salida,
    `Resumen_${String(campana.cliente).replace(/[^\w]+/g, '_')}_${run.desde}_${run.hasta}.pdf`
  );
  run.resumenDriveId = subido.id;
  run.resumenUrl = subido.webViewLink || null;
}

async function avisarAdministradores(campana, run) {
  const pendientes = diasPendientes(run);
  const sinDatos = (run.tareas ?? []).filter((t) => t.estado === 'sin_datos' || t.sinDatos);
  const errores = (run.tareas ?? []).filter((t) => t.estado === 'error');
  if (!pendientes.length && !sinDatos.length && !errores.length) return;
  const { cfg, transporter } = transporterDe();
  const lineasFuera = pendientes.map(
    (d) =>
      `- ${d.nombre} (${d.codigo}) ${d.dia}: ${Number(d.horas_fuera_rango).toFixed(1)} h fuera de rango sin defrost, ${Number(d.horas_defrost).toFixed(1)} h defrost, ${Number(d.horas_fuera_total).toFixed(1)} h fuera de rango en total`
  );
  const lineasSin = sinDatos.map((t) => `- ${t.nombre} (${t.codigo}) ${t.desde} a ${t.hasta}`);
  const lineasError = errores.map((t) => `- ${t.nombre} (${t.codigo}) ${t.desde} a ${t.hasta}: ${t.error}`);
  const subject = pendientes.length
    ? `URGENTE REPORTE FUERA DE RANGO — ${campana.cliente}`
    : `REPORTE SIN INFORMACION — ${campana.cliente}`;
  const info = await transporter.sendMail({
    from: `"${cfg.fromName || 'ZTRACK TELEMETRY'}" <${cfg.user}>`,
    to: correosAdmin(campana).join(', '),
    subject,
    text: [
      `Campaña: ${campana.cliente}`,
      `Periodo: ${run.desde} a ${run.hasta}`,
      '',
      pendientes.length ? 'Días retenidos, fuera de rango (más de 5 h sin contar defrost):' : 'No hay días retenidos por fuera de rango.',
      ...lineasFuera,
      pendientes.length
        ? 'Esos días no se publicaron. En Drive quedó el día en blanco, pendiente de procesar.'
        : '',
      '',
      sinDatos.length ? 'Periodos sin información:' : 'No hay periodos sin información.',
      ...lineasSin,
      errores.length ? '' : null,
      errores.length ? 'No se pudo generar:' : null,
      ...lineasError,
    ]
      .filter((line) => line != null)
      .join('\n'),
  });
  run.urgenteMessageId = info.messageId;
}

async function enviarAviso(campana, run) {
  const { cfg, transporter } = transporterDe();
  const links = [];
  const seen = new Set();
  if (run.clienteCarpetaUrl) {
    links.push(`${campana.cliente}: ${run.clienteCarpetaUrl}`);
    seen.add(run.clienteCarpetaUrl);
  }
  for (const t of run.tareas) {
    if (t.estado === 'subido' && t.carpetaUrl && !seen.has(t.carpetaUrl)) {
      seen.add(t.carpetaUrl);
      links.push(`${t.ruta}: ${t.carpetaUrl}`);
    }
  }
  const text = [
    `El informe de cadena de frío de ${campana.cliente} correspondiente al ${run.desde} a ${run.hasta} ya está generado y se puede ver en Drive.`,
    run.resumenUrl ? `Resumen de horas: ${run.resumenUrl}` : '',
    '',
    ...links,
  ]
    .filter((line) => line != null)
    .join('\n');
  const info = await transporter.sendMail({
    from: `"${cfg.fromName || 'ZTRACK TELEMETRY'}" <${cfg.user}>`,
    to: campana.emails.join(', '),
    subject: `Informe de cadena de frío listo — ${campana.cliente} — ${run.desde} a ${run.hasta}`,
    text,
  });
  return info.messageId;
}

function marcarPeriodo(run) {
  if (!run.periodoClave || run.manual) return;
  const rows = listRaw();
  const campana = rows.find((c) => c.id === run.campanaId);
  if (!campana) return;
  campana.ultimoPeriodo = run.periodoClave;
  campana.updatedAt = new Date().toISOString();
  saveCampanas(rows);
}

async function procesarCorrida(run) {
  const campana = listRaw().find((c) => c.id === run.campanaId);
  if (!campana) {
    run.estado = 'error';
    run.mailError = 'La campaña ya no existe';
    persistRun(run);
    return;
  }
  if (run.estado === 'error_correo' || run.estado === 'enviando') {
    try {
      if (!run.resumenDriveId) {
        try {
          await publicarResumen(run, campana);
        } catch (e) {
          run.resumenError = e.message || String(e);
        }
      }
      if (!run.urgenteMessageId) {
        try {
          await avisarAdministradores(campana, run);
        } catch (e) {
          run.urgenteError = e.message || String(e);
        }
      }
      run.mailMessageId = await enviarAviso(campana, run);
      run.mailError = null;
      run.estado = 'enviado';
      marcarPeriodo(run);
    } catch (e) {
      run.mailError = e.message || String(e);
      run.estado = 'error_correo';
    }
    persistRun(run);
    return;
  }

  run.estado = 'generando';
  try {
    await asegurarDestinos(run, campana);
  } catch (e) {
    run.estado = 'error';
    run.mailError = e.message || String(e);
    persistRun(run);
    return;
  }
  persistRun(run);

  for (const tarea of run.tareas) {
    if (tarea.estado === 'subido' || tarea.estado === 'sin_datos' || tarea.estado === 'error') continue;
    if (tarea.estado === 'pendiente') {
      try {
        const hecho = await generarInformeSync({
          dirId: `${run.id}-${tarea.codigo}-${tarea.imei}-${tarea.desde}`.replace(/[^a-zA-Z0-9_-]/g, ''),
          imei: tarea.imei,
          codigo: tarea.codigo,
          nombre: tarea.nombre,
          desde: tarea.desde,
          hasta: tarea.hasta,
          tolerancia: campana.tolerancia,
          reconstruir: campana.reconstruir !== false,
          idioma: 'es',
          umbralHorasFuera: UMBRAL_HORAS_FUERA,
          ajustesDia: tarea.ajustes ?? [],
        });
        tarea.archivo = hecho.pdfPath;
        tarea.pdfs = hecho.pdfs;
        const dias = hecho.result?.dias_detalle ?? [];
        tarea.dias = dias;
        const publicados = dias.filter((d) => !d.pendiente);
        tarea.horasFuera = publicados.reduce((s, d) => s + Number(d.horas_fuera_rango || 0), 0);
        tarea.horasDefrost = publicados.reduce((s, d) => s + Number(d.horas_defrost || 0), 0);
        tarea.horasFueraTotal = publicados.reduce((s, d) => s + Number(d.horas_fuera_total || 0), 0);
        tarea.sinDatos = false;
        tarea.estado = 'pdf_listo';
      } catch (e) {
        const msg = e.message || String(e);
        if (esSinDatos(msg)) {
          try {
            const aviso = await pdfSinDatos(tarea);
            tarea.sinDatos = true;
            tarea.pdfs = [aviso];
            tarea.dias = [];
            tarea.horasFuera = 0;
            tarea.horasDefrost = 0;
            tarea.horasFueraTotal = 0;
            tarea.error = null;
            tarea.estado = 'pdf_listo';
          } catch (pdfErr) {
            tarea.estado = 'error';
            tarea.error = pdfErr.message || String(pdfErr);
          }
        } else {
          tarea.estado = 'error';
          tarea.error = msg;
        }
      }
      persistRun(run);
    }
    if (tarea.estado === 'pdf_listo') {
      try {
        const pdfs = (tarea.pdfs ?? []).filter((p) => p?.ruta && fs.existsSync(p.ruta));
        if (!pdfs.length) throw new Error('El PDF ya no está en el servidor');
        for (const previo of tarea.archivosDrive ?? []) {
          await archivarEnDrive(previo.id).catch(() => {});
        }
        tarea.archivosDrive = [];
        for (const pdf of pdfs) {
          const subido = await subirPdf(tarea.carpetaId, pdf.ruta, pdf.nombre);
          tarea.archivosDrive.push({ nombre: pdf.nombre, id: subido.id });
        }
        tarea.driveFileId =
          tarea.archivosDrive.find((a) => a.nombre.startsWith('Informe_') || a.nombre.startsWith('SinDatos_'))?.id ??
          null;
        tarea.estado = tarea.sinDatos ? 'sin_datos' : 'subido';
      } catch (e) {
        tarea.estado = 'error';
        tarea.error = e.message || String(e);
      }
      persistRun(run);
    }
  }

  try {
    await publicarResumen(run, campana);
  } catch (e) {
    run.resumenError = e.message || String(e);
  }
  if (!run.omitirCorreoCliente) {
    try {
      await avisarAdministradores(campana, run);
      run.urgenteError = null;
    } catch (e) {
      run.urgenteError = e.message || String(e);
    }
  }
  if (run.omitirCorreoCliente) {
    run.estado = 'enviado';
    persistRun(run);
    return;
  }
  run.estado = 'enviando';
  persistRun(run);
  try {
    run.mailMessageId = await enviarAviso(campana, run);
    run.mailError = null;
    run.estado = 'enviado';
    marcarPeriodo(run);
  } catch (e) {
    run.mailError = e.message || String(e);
    run.estado = 'error_correo';
  }
  persistRun(run);
}

export async function ajustarDiaCorrida(actor, runId, body) {
  if (!isSuperAdminUser(actor)) throw new Error('Solo el superadmin administra estos días');
  const run = listRuns().find((r) => r.id === runId);
  if (!run) throw new Error('Corrida no encontrada');
  const campana = listRaw().find((c) => c.id === run.campanaId);
  if (!campana || !puedeVer(actor, campana)) throw new Error('Corrida no encontrada');
  if (['pendiente', 'generando', 'enviando'].includes(run.estado)) {
    throw new Error('La corrida todavía se está procesando');
  }
  const dia = String(body?.dia ?? '');
  const modo = body?.modo === 'temperatura' ? 'temperatura' : 'horas';
  const valor = Number(body?.valor);
  if (!dia || !Number.isFinite(valor) || valor <= 0) throw new Error('Indique un valor mayor que cero');
  if (modo === 'horas' && valor > UMBRAL_HORAS_FUERA) {
    throw new Error('Para publicar el día, las horas fuera de rango deben quedar en 5 o menos');
  }
  const tarea = (run.tareas ?? []).find(
    (t) => t.imei === body.imei && t.codigo === body.codigo && t.desde === body.desde
  );
  if (!tarea) throw new Error('No se encontró ese equipo en la corrida');
  const info = (tarea.dias ?? []).find((d) => d.dia === dia && d.pendiente);
  if (!info) throw new Error('Ese día no está pendiente de procesar');
  tarea.ajustes = (tarea.ajustes ?? []).filter((a) => a.dia !== dia);
  tarea.ajustes.push({
    dia,
    bajar_c: modo === 'temperatura' ? valor : null,
    horas_fuera_max: modo === 'horas' ? valor : null,
  });
  tarea.estado = 'pendiente';
  tarea.error = null;
  run.estado = 'pendiente';
  run.mailError = null;
  run.urgenteMessageId = null;
  persistRun(run);
  void tickCampanas();
  return vistaCorrida(run, actor);
}

export async function tickCampanas() {
  if (busy) return;
  busy = true;
  try {
    let run = listRuns().find((r) =>
      ['pendiente', 'generando', 'enviando', 'error_correo'].includes(r.estado)
    );
    if (!run) {
      const due = campanaVencida(limaNow());
      if (due) run = encolarProgramada(due.campana, due.rango);
    }
    if (run) await procesarCorrida(run);
  } catch (e) {
    console.warn('[campaña]', e.message || e);
  } finally {
    busy = false;
  }
}
