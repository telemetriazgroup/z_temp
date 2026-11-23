import nodemailer from 'nodemailer';
import {
  readJson,
  writeJson,
  uid,
  normalizeUmbrales,
  todayKey,
  formatUmbralHoras,
} from './store.js';
import {
  formatDateTimeTz,
  parseTelemetryDate,
  parseTelemetryTimestamp,
  startOfDayMs,
} from './timezone.js';
import {
  buildFueraDeRangoEmail,
  buildApagadoEmail,
  buildRecuperacionEnRangoEmail,
  buildFueraDeLineaEmail,
  buildApiSinConexionEmail,
  buildCoberturaHorariaEmail,
} from './emailBuilder.js';
import { buildTrazabilidadEmailPack } from './emailTraceability.js';
import { deviceRowKey } from './telemetry.js';
import { loadCurrentDispositivos, loadSourceDispositivos } from './dashboard/fleetStore.js';
import { encolarAlertaEquipo } from './wa/alertas.js';
import { sincronizarControlWhatsapp } from './wa/controlFlota.js';
import { recordarIncidentes } from './wa/incidentes.js';
import { permiteReporteAutomatico } from './wa/decisionFlota.js';
import { getSmtpConfig } from './smtpRepository.js';
import { getApiAsistenciaEmails } from './apiAsistenciaRepository.js';
import { detectarEnlacesCaidos, horasSinComunicacion } from './enlaceCaido.js';
import { getLinkStatuses } from './dashboard/linkHealth.js';
import { getDeviceNameByImei } from './deviceNamesRepository.js';
import { resolveUmbralesForDevice, getDeviceAlertConfig, getDeviceAlertConfigMap, saveDeviceAlertConfig, resolveRangoOptsForDevice, coberturaFueraLineaDe } from './deviceAlertConfigRepository.js';
import { enVentanaSinSenal, cuentaCliente, HORAS_CLIENTE_TRAS_COBERTURA } from './coberturaHoraria.js';
import { isEquipoApagado, isEquipoEncendido, defrostActivoEfectivo } from './powerState.js';
import {
  fetchHistorialUltimasHoras,
  resolveAlertOutOfRangeSince,
  effectiveEnRangoAlertaFromDispositivo,
  enRangoTemperaturaAlertaFromDispositivo,
  reconcileEpisodeReference,
  computeOutOfRangeIntervals,
  computeApagadoIntervals,
  horasDesdeReferencia,
  horasDesdeReferenciaEquipo,
  horasEnterasDesdeReferenciaEquipo,
  horasEnterasDesdeReferencia,
  horasEnDiaCalendario,
  prepareHistorialTrazabilidad,
  TRACEABILITY_WINDOW_HOURS,
  HISTORICAL_WINDOW_HOURS,
  timestampRegistroHistorial,
} from './historicalTelemetry.js';
import { powerStateEfectivo } from './powerEfectivo.js';

const MAX_CICLOS = 200;
/** Horas sin telemetría para alertar fuera de línea. */
const OFFLINE_ALERT_HOURS = Number(process.env.OFFLINE_ALERT_HOURS ?? 3);
/** Correo operativo: recibe fuera de línea cada hora, con duración. */
const ZTRACK_OPS_EMAIL = String(
  process.env.ZTRACK_OPS_EMAIL ?? 'ztrack@zgroup.com.pe'
)
  .trim()
  .toLowerCase();
const ZTRACK_OFFLINE_INTERVAL_MS = 60 * 60 * 1000;

function getGrupos() {
  return readJson('grupos.json', []);
}

function getState() {
  const s = readJson('state.json', {
    episodes: {},
    lastRecovered: {},
    offline: {},
    offlineOps: {},
    apiEnlace: {},
  });
  if (!s.episodes) s.episodes = {};
  if (!s.lastRecovered) s.lastRecovered = {};
  if (!s.offline) s.offline = {};
  if (!s.offlineOps) s.offlineOps = {};
  if (!s.apiEnlace) s.apiEnlace = {};
  return s;
}

function saveState(state) {
  writeJson('state.json', state);
}

function getEpisode(state, rowKey) {
  return state.episodes?.[rowKey] ?? null;
}

function clearEpisode(state, rowKey, now, meta = {}) {
  const ep = state.episodes?.[rowKey];
  if (!ep) return null;
  const endedAt = now.toISOString();
  const durationHours = horasDesdeReferencia(ep.since, now);
  const sentUmbrales = [...ensureSentUmbrales(ep)];
  if (!state.lastRecovered) state.lastRecovered = {};
  const recovered = {
    since: ep.since,
    endedAt,
    durationHours: Math.round(durationHours * 10) / 10,
    kind: episodeKind(ep),
    sentUmbrales,
    ...meta,
  };
  state.lastRecovered[rowKey] = recovered;

  if (episodeKind(ep) === 'fuera_rango') {
    addIncidente({
      id: uid('inc'),
      tipo: 'episodio_cerrado',
      alertKind: 'fuera_rango',
      rowKey,
      imei: meta.imei ?? '—',
      codigo: meta.codigo ?? '—',
      descripcionEquipo: meta.descripcionEquipo ?? rowKey,
      nombrePlataforma: meta.nombrePlataforma ?? '—',
      grupoId: meta.grupoId ?? null,
      grupoNombre: meta.grupoNombre ?? null,
      diaCalendario: todayKey(now),
      since: ep.since,
      endedAt,
      durationHours: recovered.durationHours,
      umbralesEnviados: sentUmbrales,
      referenciaDesde: ep.since,
      estado: 'cerrado',
      enviadoAt: endedAt,
      comentarios: [],
    });
  }

  delete state.episodes[rowKey];
  return recovered;
}

function episodeKind(episode) {
  return episode?.kind ?? 'fuera_rango';
}

function clearEpisodeIfKind(state, rowKey, kind, now) {
  const ep = getEpisode(state, rowKey);
  if (!ep || episodeKind(ep) !== kind) return null;
  return clearEpisode(state, rowKey, now);
}

function ensureApagadoEpisode(state, rowKey, now) {
  let episode = getEpisode(state, rowKey);
  if (episode && episodeKind(episode) === 'apagado') {
    ensureDailySentUmbrales(episode, now);
    return episode;
  }
  if (episode) clearEpisode(state, rowKey, now);
  return startEpisode(state, rowKey, now.toISOString(), {
    kind: 'apagado',
    referenceLocked: true,
    now,
  });
}

function emailsUsuarioGrupo(grupo) {
  return (grupo.emails ?? [])
    .map((e) => String(e).trim())
    .filter((e) => e && e.toLowerCase() !== ZTRACK_OPS_EMAIL);
}

/** Clave offline por grupo+equipo (cada grupo notifica a sus usuarios). */
function offlineKey(grupoId, rowKey) {
  return `${grupoId}::${rowKey}`;
}

/** Episodio fuera de línea (mapa aparte: no pisa fuera_rango/apagado). */
function getOfflineEpisode(state, grupoId, rowKey) {
  return state.offline?.[offlineKey(grupoId, rowKey)] ?? null;
}

function ensureOfflineEpisode(state, grupoId, rowKey, sinceIso, now) {
  if (!state.offline) state.offline = {};
  const key = offlineKey(grupoId, rowKey);
  let ep = state.offline[key];
  if (ep) return ep;
  ep = {
    since: sinceIso,
    userNotified: false,
    userNotifiedAt: null,
    lastZtrackAt: null,
    establishedAt: now.toISOString(),
  };
  state.offline[key] = ep;
  return ep;
}

function clearOfflineEpisode(state, grupoId, rowKey) {
  const key = offlineKey(grupoId, rowKey);
  if (state.offline?.[key]) delete state.offline[key];
  // Si ningún grupo sigue con offline de este equipo, limpia marca ops.
  const prefix = `::${rowKey}`;
  const still = Object.keys(state.offline ?? {}).some((k) => k.endsWith(prefix));
  if (!still && state.offlineOps?.[rowKey]) delete state.offlineOps[rowKey];
}

function dueZtrackOffline(state, rowKey, now) {
  const last = state.offlineOps?.[rowKey];
  if (!last) return true;
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= ZTRACK_OFFLINE_INTERVAL_MS;
}

function markZtrackOffline(state, rowKey, now) {
  if (!state.offlineOps) state.offlineOps = {};
  state.offlineOps[rowKey] = now.toISOString();
}

function startEpisode(state, rowKey, since, meta = {}) {
  if (!state.episodes) state.episodes = {};
  const now = meta.now instanceof Date ? meta.now : new Date();
  state.episodes[rowKey] = {
    since,
    sentUmbrales: [],
    sentUmbralesDay: todayKey(now),
    kind: 'fuera_rango',
    referenceLocked: true,
    historialConsultadoAt: now.toISOString(),
    establishedAt: now.toISOString(),
    ...meta,
  };
  delete state.episodes[rowKey].now;
  return state.episodes[rowKey];
}

/**
 * Los umbrales (2 h, 3 h… 24 h) se cuentan con las horas de hoy.
 * Al cambiar el día se vuelven a avisar. Una lista vieja que ya tiene
 * 24 h marcada, con el día de hoy todavía por debajo, también se reinicia:
 * si no, el evento de más de 24 h se queda en silencio.
 */
export function ensureDailySentUmbrales(episode, now, horasEnDia = null) {
  if (!Array.isArray(episode.sentUmbrales)) episode.sentUmbrales = [];
  const hoy = todayKey(now);
  const maxSent = episode.sentUmbrales.reduce((m, u) => Math.max(m, Number(u) || 0), 0);
  const horas = Number(horasEnDia);
  const listaDeOtroDia = episode.cicloDia
    ? episode.cicloDia !== hoy
    : Number.isFinite(horas) && maxSent >= horas + 1;
  if (listaDeOtroDia) {
    episode.sentUmbrales = [];
    delete episode.umbralActualNoAntes;
  }
  if (episode.cicloDia || Number.isFinite(horas)) episode.cicloDia = hoy;
  episode.sentUmbralesDay = hoy;
  return episode.sentUmbrales;
}

/** Horas del evento que caen en el día calendario actual, hasta ahora. */
export function horasDelEventoHoy(sinceIso, now = new Date()) {
  const sinceMs = parseTelemetryTimestamp(sinceIso);
  const nowMs = now instanceof Date ? now.getTime() : parseTelemetryTimestamp(now);
  if (!Number.isFinite(sinceMs) || !Number.isFinite(nowMs)) return 0;
  const inicio = Math.max(sinceMs, startOfDayMs(now));
  if (nowMs <= inicio) return 0;
  return Math.round(((nowMs - inicio) / 3600000) * 100) / 100;
}

function umbralAlcanzado(umbrales, horas) {
  let mejor = null;
  for (const u of umbrales) {
    if (horas >= u && (mejor == null || u > mejor)) mejor = u;
  }
  return mejor;
}

function detalleAlertaWhatsapp(estado, since, umbralHoras, horasTotal, detalleCorto) {
  if (Number(horasTotal) > 24) {
    return `Hoy lleva más de ${formatUmbralHoras(umbralHoras)} ${estado}. El evento lleva ${horasTotal} h en total, desde ${formatRef(since)}.`;
  }
  return detalleCorto;
}

async function fetchTrazabilidadCorreo(dispositivo, now) {
  const codigo = dispositivo?.codigo;
  const imei = dispositivo?.imei;
  if (!codigo || !imei) return null;
  try {
    const hist = await fetchHistorialUltimasHoras(
      codigo,
      imei,
      TRACEABILITY_WINDOW_HOURS,
      now
    );
    return prepareHistorialTrazabilidad(hist.datos ?? [], now);
  } catch {
    return null;
  }
}

async function buildTrazabilidadForEmail(trazabilidad, dispositivo, dispositivoReeferId, nombrePlataforma) {
  if (!trazabilidad) {
    return { trazabilidadHtml: '', trazabilidadAttachments: [] };
  }
  const chartTitle = `Reefer Monitoring Data ${dispositivo?.imei ?? ''}(${nombrePlataforma || dispositivoReeferId})`;
  const pack = await buildTrazabilidadEmailPack(trazabilidad, {
    chartTitle,
    imei: dispositivo?.imei,
  });
  return {
    trazabilidadHtml: pack.html,
    trazabilidadAttachments: pack.attachments ?? [],
  };
}

function ensureSentUmbrales(episode) {
  if (!Array.isArray(episode.sentUmbrales)) episode.sentUmbrales = [];
  return episode.sentUmbrales;
}

/** ¿Ya se envió este umbral en el episodio actual? */
function umbralYaEnviado(episode, umbralHoras) {
  return ensureSentUmbrales(episode).includes(umbralHoras);
}

function formatRef(iso) {
  return formatDateTimeTz(iso);
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
  if (entry?.rowKey && !permiteReporteAutomatico(entry.rowKey)) return null;
  const all = getIncidentes();
  all.unshift(entry);
  writeJson('incidentes.json', all.slice(0, 1000));
  return entry;
}

function getCiclos() {
  return readJson('ciclos.json', []);
}

function saveCiclo(ciclo) {
  const all = [ciclo, ...getCiclos()].slice(0, MAX_CICLOS);
  writeJson('ciclos.json', all);
  return ciclo;
}

function resolveLabels(assignment, dispositivo) {
  const desc = assignment.descripcionEquipo?.trim();
  const nombreAsignado = assignment.nombrePlataforma?.trim();
  const imei = dispositivo?.imei ?? assignment.imei ?? '—';
  const codigo = dispositivo?.codigo ?? assignment.codigo ?? '';
  const fromServer = getDeviceNameByImei(imei);
  const fallbackTecnico = codigo ? `${codigo} · ${imei}` : imei;

  const nombreCliente =
    [fromServer, nombreAsignado].find((v) => v && v !== 'SIN ASIGNAR') ?? fallbackTecnico;

  return {
    dispositivoReeferId: desc || nombreCliente,
    nombrePlataforma: nombreCliente,
  };
}

/** Marca el umbral enviado y los inferiores del episodio (evita reenvíos acumulados). */
function markUmbralEnviado(episode, umbralHoras, umbrales) {
  if (!episode.sentUmbrales) episode.sentUmbrales = [];
  for (const u of umbrales) {
    if (u <= umbralHoras && !episode.sentUmbrales.includes(u)) {
      episode.sentUmbrales.push(u);
    }
  }
  episode.sentUmbrales.sort((a, b) => a - b);
}

const ESPERA_UMBRAL_ACTUAL_MS = 10 * 60 * 1000;

/**
 * Si se vencieron varios umbrales sin avisar, los anteriores al penúltimo caducan:
 * no se reenvían. Se avisa la hora previa ahora y la actual 10 minutos después.
 */
export function planUmbralAviso(umbrales, horasTranscurridas, sentUmbrales, now, episode) {
  const sent = new Set(Array.isArray(sentUmbrales) ? sentUmbrales : []);
  const pendientes = [...umbrales]
    .filter((u) => horasTranscurridas >= u && !sent.has(u))
    .sort((a, b) => a - b);
  const hold = episode?.umbralActualNoAntes
    ? new Date(episode.umbralActualNoAntes).getTime()
    : 0;
  if (pendientes.length === 0) {
    return { enviar: null, caducar: [], esperaHasta: null, diferirActual: false, actual: null };
  }
  if (pendientes.length === 1) {
    const actual = pendientes[0];
    if (Number.isFinite(hold) && hold > now.getTime()) {
      return {
        enviar: null,
        caducar: [],
        esperaHasta: episode.umbralActualNoAntes,
        diferirActual: false,
        actual,
      };
    }
    return { enviar: actual, caducar: [], esperaHasta: null, diferirActual: false, actual };
  }
  const actual = pendientes[pendientes.length - 1];
  const anterior = pendientes[pendientes.length - 2];
  return {
    enviar: anterior,
    caducar: pendientes.filter((u) => u < anterior),
    esperaHasta: null,
    diferirActual: true,
    actual,
  };
}

function caducarUmbrales(episode, caducar) {
  if (!caducar?.length) return;
  if (!Array.isArray(episode.sentUmbrales)) episode.sentUmbrales = [];
  for (const u of caducar) {
    if (!episode.sentUmbrales.includes(u)) episode.sentUmbrales.push(u);
  }
  episode.sentUmbrales.sort((a, b) => a - b);
}

function cerrarEsperaUmbral(episode, plan, now) {
  if (plan?.diferirActual) {
    episode.umbralActualNoAntes = new Date(now.getTime() + ESPERA_UMBRAL_ACTUAL_MS).toISOString();
    return;
  }
  delete episode.umbralActualNoAntes;
}

function textoCaducados(plan) {
  if (!plan?.caducar?.length) return '';
  return ` Umbrales ya caducados, sin reenviar: ${plan.caducar.map(formatUmbralHoras).join(', ')}.`;
}

function textoEsperaUmbral(plan) {
  if (!plan?.esperaHasta || plan.actual == null) return '';
  return ` El aviso de ${formatUmbralHoras(plan.actual)} espera 10 min tras regularizar el anterior (${formatRef(plan.esperaHasta)}).`;
}

function proximoUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales) {
  return umbrales.find((u) => horasTranscurridas < u && !sentUmbrales.includes(u)) ?? null;
}

async function ensureOutOfRangeReference(state, assignment, dispositivo, now, ownerUsername = null) {
  const cfg = getDeviceAlertConfig(assignment.rowKey);
  const rangoOpts = resolveRangoOptsForDevice(assignment.rowKey);
  let episode = getEpisode(state, assignment.rowKey);
  episode = episode && episodeKind(episode) === 'fuera_rango' ? episode : null;

  if (cfg?.mode === 'custom' && cfg.useReferenciaManual && cfg.referenciaManual) {
    if (!episode) {
      episode = startEpisode(state, assignment.rowKey, cfg.referenciaManual, {
        referenciaManual: true,
        referenceLocked: true,
        now,
      });
    } else {
      episode.since = cfg.referenciaManual;
      episode.referenceLocked = true;
      episode.referenciaManual = true;
    }
    return {
      episode,
      consultaHistorial: false,
      criterioRef: `Referencia manual: ${formatRef(cfg.referenciaManual)}. Sin consulta 12 h.`,
    };
  }

  const codigo = dispositivo.codigo ?? assignment.codigo;
  const hist = await fetchHistorialUltimasHoras(
    codigo,
    dispositivo.imei,
    HISTORICAL_WINDOW_HOURS,
    now
  );
  const since = resolveAlertOutOfRangeSince(hist.datos, now, rangoOpts);

  if (since == null) {
    let recovered = null;
    if (episode) {
      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      recovered = clearEpisode(state, assignment.rowKey, now, {
        imei: dispositivo.imei,
        codigo: dispositivo.codigo ?? '—',
        descripcionEquipo: dispositivoReeferId,
        nombrePlataforma,
        grupoId: null,
        grupoNombre: null,
      });
    }
    return {
      episode: null,
      recovered: recovered ?? true,
      recoveredDetail: recovered,
      consultaHistorial: true,
      criterioRef:
        'Consulta 12 h (return_air): EN RANGO. Episodio cerrado; contador de umbrales en 0.',
    };
  }

  if (episode) {
    const reconciled = reconcileEpisodeReference(episode, hist.datos, now, rangoOpts);
    if (reconciled == null) {
      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      const recovered = clearEpisode(state, assignment.rowKey, now, {
        imei: dispositivo.imei,
        codigo: dispositivo.codigo ?? '—',
        descripcionEquipo: dispositivoReeferId,
        nombrePlataforma,
      });
      return {
        episode: null,
        recovered: recovered ?? true,
        recoveredDetail: recovered,
        consultaHistorial: true,
        criterioRef: 'Historial indica recuperación EN RANGO. Episodio cerrado.',
      };
    }

    if (reconciled.resetUmbrales) {
      episode.since = reconciled.since;
      episode.sentUmbrales = [];
      episode.sentUmbralesDay = todayKey(now);
      episode.referenceLocked = true;
      episode.historialConsultadoAt = now.toISOString();
      return {
        episode,
        consultaHistorial: true,
        criterioRef: `Nuevo incidente fuera de rango desde ${formatRef(reconciled.since)}. Umbrales reiniciados (2 h, 3 h…).`,
      };
    }

    episode.since = reconciled.since;
    episode.referenceLocked = true;
    episode.historialConsultadoAt = now.toISOString();
    return {
      episode,
      consultaHistorial: true,
      criterioRef: `Incidente activo desde ${formatRef(episode.since)}. Enviados: ${ensureSentUmbrales(episode).join(', ') || 'ninguno'}.`,
    };
  }

  episode = startEpisode(state, assignment.rowKey, since, {
    fromHistorial: true,
    historialPuntos: hist.datos?.length ?? 0,
    now,
  });
  return {
    episode,
    consultaHistorial: true,
    criterioRef: `Nuevo incidente desde ${formatRef(since)} (consulta 12 h, return_air guía).`,
  };
}

function baseEval(grupo, assignment, dispositivo) {
  const { dispositivoReeferId } = resolveLabels(assignment, dispositivo);
  return {
    rowKey: assignment.rowKey,
    imei: assignment.imei,
    codigo: assignment.codigo ?? '—',
    grupoId: grupo.id,
    grupoNombre: grupo.nombre,
    descripcionEquipo: dispositivoReeferId,
    assignmentEnabled: assignment.enabled,
    configAlerta: alertConfigLabel(assignment.rowKey, grupo.ownerUsername ?? null),
  };
}

function pushEval(evaluaciones, eval_) {
  evaluaciones.push(eval_);
}

const avisosWaRecientes = new Map();

function nombreAlerta(assignment, dispositivo) {
  const { nombrePlataforma } = resolveLabels(assignment, dispositivo);
  const imei = String(dispositivo?.imei || assignment?.imei || '');
  const tecnico = dispositivo?.codigo ? `${dispositivo.codigo} · ${imei}` : imei;
  if (!nombrePlataforma || nombrePlataforma === imei || nombrePlataforma === tecnico || nombrePlataforma === 'SIN ASIGNAR') {
    return imei || nombrePlataforma || 'Equipo';
  }
  return nombrePlataforma;
}

function lineaAhora(dispositivo) {
  const d = dispositivo?.ultimo_dato ?? {};
  const partes = [
    d.set_point != null ? `set *${d.set_point}*` : null,
    d.temp_supply_1 != null ? `suministro *${d.temp_supply_1}*` : null,
    d.return_air != null ? `retorno *${d.return_air}*` : null,
    d.evaporation_coil != null ? `evaporador *${d.evaporation_coil}*` : null,
  ].filter(Boolean);
  return partes.length ? `Ahora: ${partes.join(' · ')}` : null;
}

function espejoWhatsapp({ assignment, dispositivo, titulo, detalle, grupo, marca = '' }) {
  const clave = `${assignment?.rowKey}|${titulo}|${marca}`;
  const previo = avisosWaRecientes.get(clave) || 0;
  if (Date.now() - previo < 15 * 60 * 1000) return;
  avisosWaRecientes.set(clave, Date.now());
  const nombre = nombreAlerta(assignment, dispositivo);
  const texto = [`*${nombre}*`, titulo, detalle || null, lineaAhora(dispositivo), 'Escribe *resumen* o *menu* para ver el equipo.']
    .filter(Boolean)
    .join('\n');
  void encolarAlertaEquipo({
    rowKey: assignment?.rowKey,
    imei: dispositivo?.imei,
    nombre: nombre ? String(nombre) : '',
    codigo: dispositivo?.codigo,
    texto,
    grupoWhatsapp: grupo?.whatsappActivo === true,
    emails: grupo?.emails ?? [],
    whatsappNumeros: grupo?.whatsappActivo === true ? grupo?.whatsappNumeros ?? [] : [],
  }).catch((e) => console.warn('[wa] espejo', e.message));
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
    attachments: content.attachments ?? [],
  });
  return info.messageId;
}

/**
 * Envía correo de recuperación EN RANGO (una vez al cerrar episodio fuera_rango).
 * @returns {{ sent: boolean, envioId?: string, error?: string, destinatarios?: string[] }}
 */
/**
 * Correo «volvió a rango» solo si:
 * - el episodio era fuera_rango
 * - ya se envió al menos un umbral de fuera de rango en ese intervalo
 * - no se había marcado recoveryEmailSent
 */
async function sendRecuperacionEnRangoMail({
  smtp,
  grupo,
  assignment,
  dispositivo,
  recovered,
  result,
  state = null,
}) {
  if (recovered?.kind !== 'fuera_rango') {
    return { sent: false, skipReason: 'no_fuera_rango' };
  }
  const umbralesEnviados = Array.isArray(recovered.sentUmbrales)
    ? recovered.sentUmbrales
    : [];
  if (umbralesEnviados.length === 0) {
    return {
      sent: false,
      skipReason: 'sin_alerta_fuera_previa',
    };
  }
  if (recovered.recoveryEmailSent === true) {
    return { sent: false, skipReason: 'ya_enviado' };
  }
  if (state?.recuperacionAvisada?.[assignment.rowKey]?.since === recovered.since) {
    return { sent: false, skipReason: 'ya_enviado' };
  }

  let to = emailsUsuarioGrupo(grupo);
  if (to.length === 0) {
    to = (grupo.emails ?? []).map((e) => String(e).trim()).filter(Boolean);
  }
  if (to.length === 0) {
    return { sent: false, skipReason: 'sin_destinatarios' };
  }

  const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
  const content = buildRecuperacionEnRangoEmail({
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente: grupo.cliente?.trim() || 'Cliente',
    referenciaDesde: recovered.since,
    recuperadoAt: recovered.endedAt,
    durationHours: recovered.durationHours,
    umbralesEnviados,
  });
  const envioId = uid('envio');
  if (state) {
    if (!state.recuperacionAvisada) state.recuperacionAvisada = {};
    state.recuperacionAvisada[assignment.rowKey] = {
      since: recovered.since,
      at: new Date().toISOString(),
    };
  }
  try {
    const messageId = await sendMail(smtp, to, content);
    recovered.recoveryEmailSent = true;
    if (state?.lastRecovered?.[assignment.rowKey]) {
      state.lastRecovered[assignment.rowKey].recoveryEmailSent = true;
      state.lastRecovered[assignment.rowKey].recoveryEmailAt =
        new Date().toISOString();
      state.lastRecovered[assignment.rowKey].recoveryEnvioId = envioId;
    }
    addEnvio({
      id: envioId,
      alertKind: 'en_rango',
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      rowKey: assignment.rowKey,
      imei: dispositivo.imei,
      codigo: dispositivo.codigo ?? '—',
      descripcionEquipo: dispositivoReeferId,
      nombrePlataforma,
      horasAcumuladas: recovered.durationHours,
      referenciaDesde: recovered.since,
      recuperadoAt: recovered.endedAt,
      umbralesEnviados,
      destinatarios: [...to],
      subject: content.subject,
      sentAt: new Date().toISOString(),
      messageId,
      success: true,
    });
    const horasDetectadas = Math.round(Number(recovered.durationHours) * 10) / 10;
    const avisos = umbralesEnviados.map((u) => formatUmbralHoras(u)).join(', ');
    const descripcionFuera =
      `Fuera de rango detectado. Duración ${horasDetectadas} h, desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)}. ` +
      `Rango de horas avisado: ${avisos || '—'}.`;
    addIncidente({
      id: uid('inc'),
      tipo: 'episodio_cerrado',
      envioId,
      alertKind: 'fuera_rango',
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      rowKey: assignment.rowKey,
      imei: dispositivo.imei,
      codigo: dispositivo.codigo ?? '—',
      descripcionEquipo: dispositivoReeferId,
      nombrePlataforma,
      horasAcumuladas: recovered.durationHours,
      durationHours: recovered.durationHours,
      referenciaDesde: recovered.since,
      since: recovered.since,
      endedAt: recovered.endedAt,
      recuperadoAt: recovered.endedAt,
      umbralesEnviados,
      estado: 'pendiente',
      subject: `Fuera de rango detectado · ${horasDetectadas} h`,
      descripcion: descripcionFuera,
      destinatarios: [...to],
      enviadoAt: new Date().toISOString(),
      comentarios: [],
    });
    result.emailsSent++;
    result.resumen.correoEnviado++;
    espejoWhatsapp({
      assignment,
      dispositivo,
      titulo: 'Volvió a rango',
      marca: recovered.since,
      detalle:
        `Estuvo fuera desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)} ` +
        `(${recovered.durationHours} h). El contador volvió a 0.`,
      grupo,
    });
    return { sent: true, envioId, destinatarios: to };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`${dispositivoReeferId} EN RANGO: ${msg}`);
    result.resumen.errores++;
    if (state?.recuperacionAvisada?.[assignment.rowKey]?.since === recovered.since) {
      delete state.recuperacionAvisada[assignment.rowKey];
    }
    return { sent: false, error: msg };
  }
}

/**
 * @param {{ trigger?: 'automatic' | 'manual' }} [options]
 */
/**
 * Thermoking/TUNEL: el último estado a veces marca power_state 0 con las fases
 * en varios amperios. Se confirma con la última muestra oficial de la hora.
 */
async function apagadoReal(dispositivo, cache) {
  if (isEquipoApagado(dispositivo) !== true) return false;
  const codigo = String(dispositivo?.codigo ?? '').trim().toUpperCase();
  if (codigo !== 'TERMOKING' && codigo !== 'TUNEL' && codigo !== 'THERMOKING') {
    return true;
  }
  const key = `${codigo}:${dispositivo.imei}`;
  if (cache.has(key)) return cache.get(key);
  let real = true;
  try {
    const hist = await fetchHistorialUltimasHoras(
      dispositivo.codigo,
      dispositivo.imei,
      1,
      new Date()
    );
    let last = null;
    let lastTs = -Infinity;
    for (const row of hist.datos ?? []) {
      const ts = timestampRegistroHistorial(row);
      if (Number.isNaN(ts) || ts < lastTs) continue;
      lastTs = ts;
      last = row;
    }
    if (last && powerStateEfectivo(last, codigo) === 1) real = false;
  } catch {
    real = true;
  }
  cache.set(key, real);
  return real;
}

function apiEnlaceDue(state, codigo, now) {
  const last = state.apiEnlace?.[codigo]?.lastSentAt;
  if (!last) return true;
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= ZTRACK_OFFLINE_INTERVAL_MS;
}

/**
 * Un correo por enlace caído, a asistencia técnica, a las 3 h y luego cada hora.
 * No avisa a los clientes: se presume falla de la API.
 */
async function avisarEnlacesCaidos({ state, now, smtp, enlaces, result }) {
  if (!state.apiEnlace) state.apiEnlace = {};
  const vivos = new Set(enlaces.map((e) => e.codigo));
  for (const codigo of Object.keys(state.apiEnlace)) {
    if (!vivos.has(codigo)) delete state.apiEnlace[codigo];
  }
  if (enlaces.length === 0) return;

  const destinatarios = getApiAsistenciaEmails();
  const sonda = new Map();
  try {
    const statuses = await getLinkStatuses();
    for (const s of statuses ?? []) {
      if (s?.codigo) sonda.set(s.codigo, s);
    }
  } catch {
    /* el aviso sale igual, sin el texto de la sonda */
  }

  for (const enlace of enlaces) {
    const status = sonda.get(enlace.codigo);
    const apiEntregaDatos =
      status?.ok === true &&
      ((status.online_count ?? 0) > 0 || (status.wait_count ?? 0) > 0);
    if (apiEntregaDatos) {
      delete state.apiEnlace[enlace.codigo];
      continue;
    }
    if (!apiEnlaceDue(state, enlace.codigo, now)) continue;
    const content = buildApiSinConexionEmail({
      codigo: enlace.codigo,
      horas: enlace.horas,
      equipos: enlace.equipos,
      since: enlace.since,
      error: status && status.ok === false ? status.error_message : null,
    });
    const envioId = uid('envio');
    try {
      const messageId = await sendMail(smtp, destinatarios, content);
      state.apiEnlace[enlace.codigo] = {
        since: enlace.since,
        lastSentAt: now.toISOString(),
        horas: enlace.horas,
        equipos: enlace.equipos,
      };
      addEnvio({
        id: envioId,
        alertKind: 'api_sin_conexion',
        destinatarioTipo: 'ops',
        codigo: enlace.codigo,
        descripcionEquipo: `API ${enlace.codigo}`,
        nombrePlataforma: `API ${enlace.codigo}`,
        horasOffline: enlace.horas,
        referenciaDesde: enlace.since,
        destinatarios: [...destinatarios],
        subject: content.subject,
        sentAt: now.toISOString(),
        messageId,
        success: true,
      });
      addIncidente({
        id: uid('inc'),
        tipo: 'correo_enviado',
        envioId,
        alertKind: 'api_sin_conexion',
        destinatarioTipo: 'ops',
        codigo: enlace.codigo,
        descripcionEquipo: `API ${enlace.codigo}`,
        nombrePlataforma: `API ${enlace.codigo} · ${enlace.equipos} equipos`,
        horasOffline: enlace.horas,
        referenciaDesde: enlace.since,
        estado: 'pendiente',
        subject: content.subject,
        destinatarios: [...destinatarios],
        enviadoAt: now.toISOString(),
        comentarios: [],
      });
      result.emailsSent++;
      result.resumen.correoEnviado++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`API ${enlace.codigo} sin conexión: ${msg}`);
      result.resumen.errores++;
    }
  }
}

/** Un correo por hora, a quien recibe las fallas de API, con los equipos callados por zona. */
async function avisarCoberturaCiclica({ state, now, smtp, equipos, result }) {
  if (!state.coberturaAviso) state.coberturaAviso = {};
  const vistos = new Set();
  const unicos = [];
  for (const equipo of equipos ?? []) {
    const imei = String(equipo?.imei ?? '');
    if (!imei || vistos.has(imei)) continue;
    vistos.add(imei);
    unicos.push(equipo);
  }
  if (unicos.length === 0) {
    delete state.coberturaAviso.lastSentAt;
    return;
  }
  const last = state.coberturaAviso.lastSentAt;
  const t = last ? new Date(last).getTime() : NaN;
  if (Number.isFinite(t) && now.getTime() - t < ZTRACK_OFFLINE_INTERVAL_MS) return;

  const destinatarios = getApiAsistenciaEmails();
  const content = buildCoberturaHorariaEmail({ equipos: unicos });
  const envioId = uid('envio');
  try {
    const messageId = await sendMail(smtp, destinatarios, content);
    state.coberturaAviso.lastSentAt = now.toISOString();
    addEnvio({
      id: envioId,
      alertKind: 'cobertura_horaria',
      destinatarioTipo: 'ops',
      descripcionEquipo: `${unicos.length} equipos en horario sin señal`,
      nombrePlataforma: 'Cobertura limitada',
      destinatarios: [...destinatarios],
      subject: content.subject,
      sentAt: now.toISOString(),
      messageId,
      success: true,
    });
    result.emailsSent++;
    result.resumen.correoEnviado++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Cobertura horaria: ${msg}`);
    result.resumen.errores++;
  }
}

export async function runAlertCycle(options = {}) {
  const trigger = options.trigger === 'manual' ? 'manual' : 'automatic';
  const startedAt = new Date().toISOString();
  const evaluaciones = [];
  const result = {
    id: uid('ciclo'),
    trigger,
    startedAt,
    checkedAt: startedAt,
    devicesChecked: 0,
    emailsSent: 0,
    errors: [],
    resumen: {
      normal: 0,
      fueraRangoSinEnvio: 0,
      correoEnviado: 0,
      sinTelemetria: 0,
      sinDatoRango: 0,
      equipoOff: 0,
      errores: 0,
    },
  };

  recordarIncidentes().catch((e) => console.warn('[wa] recordatorio incidente', e.message));

  const smtp = getSmtpConfig();
  if (!smtp?.user || !smtp?.appPassword) {
    result.skipped = 'smtp_not_configured';
    result.criterio = 'SMTP no configurado en base interna';
    result.finishedAt = new Date().toISOString();
    saveCiclo({ ...result, evaluaciones: [] });
    writeJson('lastRun.json', result);
    return result;
  }

  const allGrupos = getGrupos();
  const grupos = allGrupos.filter((g) => g.enabled && g.emails?.length);
  if (grupos.length === 0) {
    result.skipped = 'no_groups';
    result.criterio = 'No hay grupos de correo activos con destinatarios';
    result.finishedAt = new Date().toISOString();
    saveCiclo({ ...result, evaluaciones: [] });
    writeJson('lastRun.json', result);
    return result;
  }

  let dispositivos;
  try {
    dispositivos = await loadCurrentDispositivos();
    if (!dispositivos.length) {
      throw new Error('Flota aún no sincronizada en base de datos');
    }
  } catch (e) {
    result.errors.push(e.message);
    result.criterio = `Error al consultar telemetría: ${e.message}`;
    result.finishedAt = new Date().toISOString();
    saveCiclo({ ...result, evaluaciones: [] });
    writeJson('lastRun.json', result);
    return result;
  }

  const deviceMap = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));
  const state = getState();
  const now = new Date();
  const hoy = todayKey(now);
  const cacheApagadoFases = new Map();
  const enlacesCaidos = detectarEnlacesCaidos(
    await loadSourceDispositivos(),
    now,
    OFFLINE_ALERT_HOURS
  );
  const enlaceCaidoPorCodigo = new Map(enlacesCaidos.map((e) => [e.codigo, e]));
  await avisarEnlacesCaidos({ state, now, smtp, enlaces: enlacesCaidos, result });
  const coberturaSilencio = [];

  for (const grupo of allGrupos) {
    const grupoOwner = grupo.ownerUsername ?? null;
    for (const assignment of grupo.devices ?? []) {
      const dispositivo = deviceMap.get(assignment.rowKey) ?? null;
      const base = baseEval(grupo, assignment, dispositivo);

      if (!grupo.enabled) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'grupo_inactivo',
          accion: 'ninguna',
          criterio: `Grupo «${grupo.nombre}» inactivo. No se evalúa.`,
        });
        continue;
      }

      if (!grupo.emails?.length) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'grupo_sin_correos',
          accion: 'ninguna',
          criterio: `Grupo «${grupo.nombre}» sin destinatarios. No se evalúa.`,
        });
        continue;
      }

      if (!assignment.enabled) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'equipo_off',
          accion: 'ninguna',
          criterio: 'Equipo desactivado en el grupo. No se evalúa.',
        });
        result.resumen.equipoOff++;
        continue;
      }

      if (!permiteReporteAutomatico(assignment.rowKey)) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'sin_seguimiento',
          accion: 'ninguna',
          criterio:
            'El superadmin dejó este equipo sin seguimiento automático. No se alerta ni se abre incidente.',
        });
        continue;
      }

      result.devicesChecked++;

      if (dispositivo == null) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'sin_telemetria',
          accion: 'ninguna',
          enRango: null,
          criterio:
            'No aparece en la telemetría actual (TUNEL/STARCOOL/STARCOOL2/TERMOKING). No se puede evaluar en_rango.',
        });
        result.resumen.sinTelemetria++;
        continue;
      }

      if (
        dispositivo.ausente_api === true ||
        String(dispositivo.estado_conexion ?? '').toLowerCase() === 'historial'
      ) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'historico',
          accion: 'ninguna',
          enRango: null,
          criterio:
            'Ya no viene en la API de este periodo. Queda en historial con su última conexión y no se avisa como fuera de línea.',
        });
        continue;
      }

      const rangoOpts = resolveRangoOptsForDevice(assignment.rowKey, grupoOwner);
      const enRangoRaw = dispositivo.en_rango;
      const enRangoEfectivo = effectiveEnRangoAlertaFromDispositivo(dispositivo, rangoOpts);
      const umbrales = resolveUmbralesForDevice(
        assignment.rowKey,
        assignment.umbralesHoras,
        grupoOwner
      );
      const telem = {
        setPoint: dispositivo.ultimo_dato?.set_point ?? null,
        tempSupply: dispositivo.ultimo_dato?.temp_supply_1 ?? null,
        returnAir: dispositivo.ultimo_dato?.return_air ?? null,
        ultimaActualizacion: dispositivo.ultima_actualizacion ?? null,
        estadoConexion: dispositivo.estado_conexion ?? null,
        enDefrost: dispositivo.en_defrost ?? null,
        powerState: dispositivo.ultimo_dato?.power_state ?? null,
      };

      // —— Fuera de línea (> OFFLINE_ALERT_HOURS sin telemetría) ——
      const horasOffline = horasSinComunicacion(dispositivo, now);
      if (horasOffline != null && horasOffline >= OFFLINE_ALERT_HOURS) {
        const codigoEnlace = String(dispositivo.codigo ?? '').trim();
        const enlaceCaido = enlaceCaidoPorCodigo.get(codigoEnlace);
        if (enlaceCaido) {
          pushEval(evaluaciones, {
            ...base,
            estado: 'fuera_linea_sin_envio',
            accion: 'ninguna',
            enRango: null,
            diaCalendario: hoy,
            horasOffline: Math.round(horasOffline * 10) / 10,
            telemetria: telem,
            criterio:
              `FUERA DE LÍNEA porque el enlace ${codigoEnlace} no entrega datos ` +
              `(~${enlaceCaido.horas} h, ${enlaceCaido.equipos} equipos). ` +
              'No se avisa al cliente: se presume falla de la API. El aviso va a asistencia técnica.',
          });
          continue;
        }

        const cobertura = coberturaFueraLineaDe(assignment.rowKey);
        if (cobertura && enVentanaSinSenal(cobertura.desde, cobertura.hasta, now)) {
          const { nombrePlataforma } = resolveLabels(assignment, dispositivo);
          const ya = coberturaSilencio.some((e) => e.imei === dispositivo.imei);
          if (!ya) {
            coberturaSilencio.push({
              nombre: nombrePlataforma,
              imei: dispositivo.imei,
              desde: cobertura.desde,
              hasta: cobertura.hasta,
              ultima: dispositivo.ultima_actualizacion,
              horas: Math.round(horasOffline * 10) / 10,
            });
          }
          pushEval(evaluaciones, {
            ...base,
            estado: 'cobertura_horaria',
            accion: 'ninguna',
            enRango: null,
            diaCalendario: hoy,
            horasOffline: Math.round(horasOffline * 10) / 10,
            telemetria: telem,
            criterio:
              `FUERA DE LÍNEA dentro del horario sin señal ${cobertura.desde}–${cobertura.hasta}. ` +
              'No se avisa al cliente. Queda en el correo cíclico de cobertura.',
          });
          continue;
        }

        const cuentaCobertura = cobertura
          ? cuentaCliente(dispositivo.ultima_actualizacion, cobertura.desde, cobertura.hasta, now)
          : null;
        if (cobertura && (cuentaCobertura == null || cuentaCobertura.horas < HORAS_CLIENTE_TRAS_COBERTURA)) {
          pushEval(evaluaciones, {
            ...base,
            estado: 'cobertura_esperando',
            accion: 'ninguna',
            enRango: null,
            diaCalendario: hoy,
            horasOffline: cuentaCobertura?.horas ?? 0,
            telemetria: telem,
            criterio:
              `Cobertura de vuelta a las ${cobertura.hasta}. ` +
              `Lleva ${cuentaCobertura?.horas ?? 0} h desde esa hora. ` +
              `El correo al cliente sale a las ${HORAS_CLIENTE_TRAS_COBERTURA} h.`,
          });
          continue;
        }

        const { dispositivoReeferId, nombrePlataforma } = resolveLabels(
          assignment,
          dispositivo
        );
        const sinceIso = cuentaCobertura
          ? new Date(cuentaCobertura.inicioMs).toISOString()
          : dispositivo.ultima_actualizacion != null
            ? parseTelemetryDate(dispositivo.ultima_actualizacion).toISOString()
            : now.toISOString();
        const sinceSafe = Number.isNaN(Date.parse(sinceIso))
          ? now.toISOString()
          : sinceIso;
        const offlineEp = ensureOfflineEpisode(
          state,
          grupo.id,
          assignment.rowKey,
          sinceSafe,
          now
        );
        const horasOfflineReport = Math.round((cuentaCobertura?.horas ?? horasOffline) * 10) / 10;
        const claveCobertura = cuentaCobertura ? todayKey(new Date(cuentaCobertura.inicioMs)) : null;
        const yaAvisadoUsuario = claveCobertura
          ? offlineEp.coberturaAvisadaEn === claveCobertura
          : offlineEp.userNotified === true;
        const notaCobertura = cobertura
          ? `La zona vuelve a tener cobertura a las ${cobertura.hasta}. Desde esa hora lleva ${horasOfflineReport} h fuera de línea.`
          : null;
        const cliente = grupo.cliente?.trim() || 'Cliente';
        const userEmails = emailsUsuarioGrupo(grupo);
        const acciones = [];
        let envioIds = [];
        let avisoOfflineEsteCiclo = false;

        if (!yaAvisadoUsuario && userEmails.length > 0) {
          const contentUser = buildFueraDeLineaEmail({
            dispositivo,
            dispositivoReeferId,
            nombrePlataforma,
            cliente,
            variante: 'usuario',
            referenciaDesde: sinceSafe,
            notaCobertura,
          });
          const envioId = uid('envio');
          try {
            const messageId = await sendMail(smtp, userEmails, contentUser);
            offlineEp.userNotified = true;
            offlineEp.userNotifiedAt = now.toISOString();
            if (claveCobertura) offlineEp.coberturaAvisadaEn = claveCobertura;
            addEnvio({
              id: envioId,
              alertKind: 'fuera_linea',
              destinatarioTipo: 'usuario',
              grupoId: grupo.id,
              grupoNombre: grupo.nombre,
              rowKey: assignment.rowKey,
              imei: dispositivo.imei,
              codigo: dispositivo.codigo ?? '—',
              descripcionEquipo: dispositivoReeferId,
              nombrePlataforma,
              horasOffline: horasOfflineReport,
              referenciaDesde: offlineEp.since,
              destinatarios: [...userEmails],
              subject: contentUser.subject,
              sentAt: now.toISOString(),
              messageId,
              success: true,
            });
            addIncidente({
              id: uid('inc'),
              tipo: 'correo_enviado',
              envioId,
              alertKind: 'fuera_linea',
              destinatarioTipo: 'usuario',
              grupoId: grupo.id,
              grupoNombre: grupo.nombre,
              rowKey: assignment.rowKey,
              imei: dispositivo.imei,
              codigo: dispositivo.codigo ?? '—',
              descripcionEquipo: dispositivoReeferId,
              nombrePlataforma,
              horasOffline: horasOfflineReport,
              referenciaDesde: offlineEp.since,
              estado: 'pendiente',
              subject: contentUser.subject,
              destinatarios: [...userEmails],
              enviadoAt: now.toISOString(),
              comentarios: [],
            });
            result.emailsSent++;
            result.resumen.correoEnviado++;
            envioIds.push(envioId);
            acciones.push(`usuario 1× → ${userEmails.join(', ')}`);
            const referenciaWa = claveCobertura ? sinceSafe : offlineEp.since;
            const horasHoyOff = horasDelEventoHoy(referenciaWa, now);
            espejoWhatsapp({
              assignment,
              dispositivo,
              titulo: 'Fuera de línea',
              marca: claveCobertura
                ? `${referenciaWa}|cobertura`
                : horasOfflineReport > 24
                  ? `${offlineEp.since}|${hoy}|${horasHoyOff}`
                  : offlineEp.since,
              detalle: detalleAlertaWhatsapp(
                'fuera de línea',
                referenciaWa,
                umbralAlcanzado(umbrales, horasHoyOff) ??
                  (claveCobertura ? HORAS_CLIENTE_TRAS_COBERTURA : OFFLINE_ALERT_HOURS),
                horasOfflineReport,
                `Sin comunicación desde ${formatRef(referenciaWa)}. Lleva ${horasOfflineReport} h.`
              ),
              grupo,
            });
            if (horasOfflineReport > 24) {
              ensureDailySentUmbrales(offlineEp, now, horasHoyOff);
              const alcanzado = umbralAlcanzado(umbrales, horasHoyOff);
              if (alcanzado != null) markUmbralEnviado(offlineEp, alcanzado, umbrales);
            }
            avisoOfflineEsteCiclo = true;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`${dispositivoReeferId} FUERA LÍNEA usuario: ${msg}`);
            result.resumen.errores++;
            acciones.push(`error usuario: ${msg}`);
          }
        } else if (yaAvisadoUsuario) {
          acciones.push(
            claveCobertura
              ? `usuario ya avisado tras las ${cobertura.hasta}`
              : 'usuario ya notificado (sin reenvío)'
          );
        } else {
          acciones.push('sin correos de usuario (solo ops)');
        }

        if (cuentaCobertura) {
          acciones.push('sin correo operativo individual: la zona va en el resumen de cobertura');
        } else if (dueZtrackOffline(state, assignment.rowKey, now) && ZTRACK_OPS_EMAIL) {
          const contentOps = buildFueraDeLineaEmail({
            dispositivo,
            dispositivoReeferId,
            nombrePlataforma,
            cliente: 'ZTRACK',
            variante: 'ops',
            horasOffline: horasOfflineReport,
            referenciaDesde: offlineEp.since,
          });
          const envioId = uid('envio');
          try {
            const messageId = await sendMail(smtp, [ZTRACK_OPS_EMAIL], contentOps);
            markZtrackOffline(state, assignment.rowKey, now);
            offlineEp.lastZtrackAt = now.toISOString();
            addEnvio({
              id: envioId,
              alertKind: 'fuera_linea',
              destinatarioTipo: 'ops',
              grupoId: grupo.id,
              grupoNombre: grupo.nombre,
              rowKey: assignment.rowKey,
              imei: dispositivo.imei,
              codigo: dispositivo.codigo ?? '—',
              descripcionEquipo: dispositivoReeferId,
              nombrePlataforma,
              horasOffline: horasOfflineReport,
              referenciaDesde: offlineEp.since,
              destinatarios: [ZTRACK_OPS_EMAIL],
              subject: contentOps.subject,
              sentAt: now.toISOString(),
              messageId,
              success: true,
            });
            result.emailsSent++;
            result.resumen.correoEnviado++;
            envioIds.push(envioId);
            acciones.push(
              `ops horario → ${ZTRACK_OPS_EMAIL} (~${horasOfflineReport} h)`
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.errors.push(`${dispositivoReeferId} FUERA LÍNEA ops: ${msg}`);
            result.resumen.errores++;
            acciones.push(`error ops: ${msg}`);
          }
        } else {
          acciones.push('ops: esperando intervalo 1 h');
        }

        if (horasOfflineReport > 24 && !avisoOfflineEsteCiclo) {
          const horasHoyOff = horasDelEventoHoy(offlineEp.since, now);
          ensureDailySentUmbrales(offlineEp, now, horasHoyOff);
          const planOff = planUmbralAviso(umbrales, horasHoyOff, offlineEp.sentUmbrales ?? [], now, offlineEp);
          const umbralOff = planOff.enviar;
          if (umbralOff != null && !umbralYaEnviado(offlineEp, umbralOff)) {
            caducarUmbrales(offlineEp, planOff.caducar);
            espejoWhatsapp({
              assignment,
              dispositivo,
              titulo: 'Fuera de línea',
              marca: `${offlineEp.since}|${hoy}|${umbralOff}`,
              detalle: detalleAlertaWhatsapp(
                'fuera de línea',
                offlineEp.since,
                umbralOff,
                horasOfflineReport,
                `Sin comunicación desde ${formatRef(offlineEp.since)}. Lleva ${horasOfflineReport} h.`
              ),
              grupo,
            });
            markUmbralEnviado(offlineEp, umbralOff, umbrales);
            cerrarEsperaUmbral(offlineEp, planOff, now);
            acciones.push(`whatsapp ${formatUmbralHoras(umbralOff)} de hoy, ${horasOfflineReport} h en total`);
          }
        }

        pushEval(evaluaciones, {
          ...base,
          estado:
            envioIds.length > 0 ? 'correo_fuera_linea_enviado' : 'fuera_linea_sin_envio',
          accion: envioIds.length > 0 ? 'envio' : 'ninguna',
          enRango: null,
          diaCalendario: hoy,
          horasOffline: horasOfflineReport,
          referenciaDesde: offlineEp.since,
          envioId: envioIds[0] ?? null,
          telemetria: telem,
          criterio: `FUERA DE LÍNEA ~${horasOfflineReport} h (≥ ${OFFLINE_ALERT_HOURS} h). ${acciones.join(' · ')}. No se evalúa temperatura con telemetría antigua.`,
        });
        continue;
      }

      // Volvió a línea: cerrar episodio offline (sin correo).
      if (getOfflineEpisode(state, grupo.id, assignment.rowKey)) {
        clearOfflineEpisode(state, grupo.id, assignment.rowKey);
      }

      if (await apagadoReal(dispositivo, cacheApagadoFases)) {
        clearEpisodeIfKind(state, assignment.rowKey, 'fuera_rango', now);
        const episode = ensureApagadoEpisode(state, assignment.rowKey, now);
        const horasAcumuladas = horasDesdeReferenciaEquipo(dispositivo, episode.since, now);
        const horasEnDia = horasEnDiaCalendario(episode.since, dispositivo, now);
        const horasEnteras = horasEnterasDesdeReferenciaEquipo(dispositivo, episode.since, now);
        const horasAcumTxt = `${Math.round(horasAcumuladas * 10) / 10} h acum.`;
        const horasDiaTxt = `${Math.round(horasEnDia * 10) / 10} h hoy`;
        ensureDailySentUmbrales(episode, now, horasEnDia);
        const planAviso = planUmbralAviso(umbrales, horasEnDia, episode.sentUmbrales ?? [], now, episode);
        caducarUmbrales(episode, planAviso.caducar);
        const sentUmbrales = episode.sentUmbrales ?? [];
        const umbralHoras = planAviso.enviar;
        const nextUmbral = proximoUmbralPendiente(umbrales, horasEnDia, sentUmbrales);
        const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
        const tipoEvento =
          assignment.tipoEvento === 'mantenimiento' ? 'mantenimiento' : 'operaciones';

        if (umbralHoras == null || umbralYaEnviado(episode, umbralHoras)) {
          const criterio =
            sentUmbrales.length > 0
              ? `APAGADO ${horasDiaTxt} (${horasAcumTxt} desde ${formatRef(episode.since)}). Último aviso hoy: ${formatUmbralHoras(sentUmbrales[sentUmbrales.length - 1])}. ${nextUmbral != null ? `Esperando ${formatUmbralHoras(nextUmbral)} en ${hoy}.` : 'Sin más umbrales hoy.'}${textoEsperaUmbral(planAviso)}${textoCaducados(planAviso)} No se evalúa fuera de rango mientras esté OFF.`
              : `APAGADO ${horasDiaTxt} (${horasAcumTxt} desde ${formatRef(episode.since)}). ${nextUmbral != null ? `Próximo aviso al alcanzar ${formatUmbralHoras(nextUmbral)} en ${hoy}.` : 'Sin umbrales pendientes hoy.'}${textoEsperaUmbral(planAviso)} Fuera de rango solo con equipo ON.`;
          pushEval(evaluaciones, {
            ...base,
            estado: 'equipo_apagado',
            accion: 'ninguna',
            enRango: null,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
            horasEnDiaCalendario: Math.round(horasEnDia * 10) / 10,
            horasAcumuladas: Math.round(horasAcumuladas * 10) / 10,
            referenciaDesde: episode.since,
            umbralesConfigurados: umbrales,
            umbralesEnviadosHoy: [...sentUmbrales],
            proximoUmbralHoras: nextUmbral ?? null,
            telemetria: telem,
            criterio,
          });
          result.resumen.fueraRangoSinEnvio++;
          continue;
        }

        const horasApagadoReport = Math.round(horasAcumuladas * 10) / 10;
        const horasEnDiaReport = Math.round(horasEnDia * 10) / 10;
        const trazabilidad = await fetchTrazabilidadCorreo(dispositivo, now);
        const trazEmail = await buildTrazabilidadForEmail(
          trazabilidad,
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma
        );
        const content = buildApagadoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasApagado: horasApagadoReport,
          horasEnDia: horasEnDiaReport,
          horasAcumuladas: horasApagadoReport,
          diaCalendario: hoy,
          hoy,
          referenciaDesde: episode.since,
          tipoEvento,
          trazabilidad,
          ...trazEmail,
        });
        const envioId = uid('envio');
        const criterioEnvio = `APAGADO ${horasDiaTxt} / ${horasAcumTxt} desde ${formatRef(episode.since)} (GMT-5). Se envía alerta APAGADO umbral ${formatUmbralHoras(umbralHoras)} del día ${hoy}.${textoCaducados(planAviso)}${planAviso.diferirActual ? ` El umbral de ${formatUmbralHoras(planAviso.actual)} se envía 10 min después.` : ''} Destino: ${grupo.emails.join(', ')}.`;

        try {
          const messageId = await sendMail(smtp, grupo.emails, content);
          markUmbralEnviado(episode, umbralHoras, umbrales);
          cerrarEsperaUmbral(episode, planAviso, now);
          espejoWhatsapp({
            assignment,
            dispositivo,
            titulo: 'Apagado',
            marca: `${episode.since}|${hoy}|${umbralHoras}`,
            detalle: detalleAlertaWhatsapp(
              'apagado',
              episode.since,
              umbralHoras,
              horasApagadoReport,
              `Apagado desde ${formatRef(episode.since)}. Lleva ${horasApagadoReport} h. Aviso de ${formatUmbralHoras(umbralHoras)}.`
            ),
            grupo,
          });
          addEnvio({
            id: envioId,
            alertKind: 'apagado',
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            umbralHoras,
            horasFueraRango: horasApagadoReport,
            horasEnDiaCalendario: horasEnDiaReport,
            horasAcumuladas: horasApagadoReport,
            referenciaDesde: episode.since,
            diaCalendario: hoy,
            tipoEvento,
            trazabilidad3h: trazabilidad,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            messageId,
            success: true,
          });
          const incidenteId = uid('inc');
          addIncidente({
            id: incidenteId,
            tipo: 'correo_enviado',
            envioId,
            alertKind: 'apagado',
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            diaCalendario: hoy,
            umbralHoras,
            horasFueraRango: horasApagadoReport,
            horasEnDiaCalendario: horasEnDiaReport,
            horasAcumuladas: horasApagadoReport,
            referenciaDesde: episode.since,
            trazabilidad3h: trazabilidad,
            tipoEvento,
            estado: 'pendiente',
            subject: content.subject,
            destinatarios: [...grupo.emails],
            enviadoAt: new Date().toISOString(),
            comentarios: [],
          });
          pushEval(evaluaciones, {
            ...base,
            estado: 'correo_apagado_enviado',
            accion: 'envio',
            enRango: null,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
            referenciaDesde: episode.since,
            umbralDisparado: umbralHoras,
            umbralesConfigurados: umbrales,
            umbralesEnviadosHoy: [...episode.sentUmbrales],
            tipoEvento,
            envioId,
            incidenteId,
            telemetria: telem,
            criterio: criterioEnvio,
          });
          result.emailsSent++;
          result.resumen.correoEnviado++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`${dispositivoReeferId} APAGADO ${umbralHoras}h: ${msg}`);
          pushEval(evaluaciones, {
            ...base,
            estado: 'error_envio',
            accion: 'error',
            diaCalendario: hoy,
            telemetria: telem,
            criterio: `${criterioEnvio} Error SMTP: ${msg}`,
          });
          result.resumen.errores++;
        }
        continue;
      }

      if (isEquipoEncendido(dispositivo) === true) {
        clearEpisodeIfKind(state, assignment.rowKey, 'apagado', now);
      }

      const enDefrost = defrostActivoEfectivo(dispositivo);
      const enRangoTemperatura = enRangoTemperaturaAlertaFromDispositivo(
        dispositivo,
        rangoOpts
      );

      // Defrost: NO cierra el incidente ni envía «volvió a rango» (evita spam cada ciclo).
      // Solo pausa alertas de fuera de rango mientras dura el defrost.
      if (enDefrost && enRangoTemperatura !== true) {
        const ep = getEpisode(state, assignment.rowKey);
        const epFuera = ep && episodeKind(ep) === 'fuera_rango' ? ep : null;
        pushEval(evaluaciones, {
          ...base,
          estado: 'defrost_pausa',
          accion: 'ninguna',
          enRango: true,
          diaCalendario: hoy,
          umbralesConfigurados: umbrales,
          referenciaDesde: epFuera?.since ?? null,
          telemetria: telem,
          criterio: epFuera
            ? `DEFROST activo. Episodio fuera de rango en pausa desde ${formatRef(epFuera.since)} (no se cierra; no correo «volvió a rango»).`
            : 'DEFROST activo con equipo ON. No se alerta fuera de rango.',
        });
        result.resumen.normal++;
        continue;
      }

      // Recuperación real: return_air otra vez en banda.
      if (enRangoTemperatura === true) {
        const { dispositivoReeferId, nombrePlataforma } = resolveLabels(
          assignment,
          dispositivo
        );
        const recovered = clearEpisode(state, assignment.rowKey, now, {
          imei: dispositivo.imei,
          codigo: dispositivo.codigo ?? '—',
          descripcionEquipo: dispositivoReeferId,
          nombrePlataforma,
          grupoId: grupo.id,
          grupoNombre: grupo.nombre,
        });
        let criterio;
        let accion = 'ninguna';
        let estado = 'normal';
        let envioId = null;
        if (recovered?.kind === 'fuera_rango') {
          const mail = await sendRecuperacionEnRangoMail({
            smtp,
            grupo,
            assignment,
            dispositivo,
            recovered,
            result,
            state,
          });
          if (mail.sent) {
            accion = 'envio';
            estado = 'correo_en_rango_enviado';
            envioId = mail.envioId ?? null;
            criterio = `EN RANGO (return_air). Incidente cerrado (fuera desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)}, ~${recovered.durationHours} h). Correo «volvió a rango» (hubo alerta fuera previa) → ${(mail.destinatarios ?? []).join(', ')}.`;
          } else if (mail.error) {
            estado = 'error_envio';
            accion = 'error';
            criterio = `EN RANGO. Incidente cerrado (~${recovered.durationHours} h) pero falló correo recuperación: ${mail.error}`;
          } else if (mail.skipReason === 'sin_alerta_fuera_previa') {
            criterio = `EN RANGO (return_air). Incidente cerrado (~${recovered.durationHours} h) sin correo: no hubo alerta de fuera de rango en ese intervalo.`;
          } else {
            criterio = `EN RANGO (return_air). Incidente cerrado (fuera desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)}, ~${recovered.durationHours} h). Sin correo recuperación (${mail.skipReason ?? 'n/d'}).`;
          }
        } else if (recovered) {
          criterio = `EN RANGO (return_air). Episodio ${recovered.kind} cerrado. Contador en 0.`;
        } else {
          criterio =
            'EN RANGO (return_air). Temperatura dentro de parámetros. No se envía correo.';
        }
        pushEval(evaluaciones, {
          ...base,
          estado,
          accion,
          enRango: true,
          diaCalendario: hoy,
          umbralesConfigurados: umbrales,
          referenciaDesde: recovered?.since ?? null,
          recuperadoAt: recovered?.endedAt ?? null,
          envioId,
          telemetria: telem,
          criterio,
        });
        if (estado === 'normal') result.resumen.normal++;
        void sincronizarControlWhatsapp({
          rowKey: assignment.rowKey,
          imei: dispositivo.imei,
          nombre: dispositivo.descripcion || dispositivo.nombre || assignment?.nombre,
          codigo: dispositivo.codigo,
          enRango: true,
          setPoint: dispositivo.ultimo_dato?.set_point,
          returnAir: dispositivo.ultimo_dato?.return_air,
        }).catch((e) => console.warn('[wa] control', e.message));
        continue;
      }

      if (enRangoEfectivo !== false && enRangoRaw !== false) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'sin_dato_rango',
          accion: 'ninguna',
          enRango: null,
          diaCalendario: hoy,
          umbralesConfigurados: umbrales,
          telemetria: telem,
          criterio:
            'Telemetría sin indicador en_rango (null). No se puede determinar si debe alertar.',
        });
        result.resumen.sinDatoRango++;
        continue;
      }

      let episode;
      let consultaHistorial = false;
      let criterioRef;
      try {
        const ref = await ensureOutOfRangeReference(
          state,
          assignment,
          dispositivo,
          now,
          grupoOwner
        );
        consultaHistorial = ref.consultaHistorial;
        criterioRef = ref.criterioRef;

        if (ref.recovered || ref.episode == null) {
          const recoveredDetail = ref.recoveredDetail;
          // Si el historial cerró pero return_air actual sigue fuera, reabrir episodio.
          if (
            recoveredDetail?.kind === 'fuera_rango' &&
            enRangoTemperatura !== true &&
            recoveredDetail.since
          ) {
            episode = startEpisode(state, assignment.rowKey, now.toISOString(), {
              kind: 'fuera_rango',
              sentUmbrales: [],
              sentUmbralesDay: todayKey(now),
              fromHistorial: true,
              now,
            });
            criterioRef =
              `El episodio anterior cerró al volver a rango. Contador en 0 desde ${formatRef(episode.since)}. ` +
              `El próximo aviso espera de nuevo 2 h, o 30 min / 1 h si el equipo los tiene configurados.`;
          } else {
            pushEval(evaluaciones, {
              ...base,
              estado: 'normal',
              accion: 'ninguna',
              enRango: true,
              diaCalendario: hoy,
              umbralesConfigurados: umbrales,
              consultaHistorial,
              recuperadoAt: recoveredDetail?.endedAt ?? null,
              telemetria: telem,
              criterio: criterioRef,
            });
            result.resumen.normal++;
            void sincronizarControlWhatsapp({
              rowKey: assignment.rowKey,
              imei: dispositivo.imei,
              nombre: dispositivo.descripcion || dispositivo.nombre || assignment?.nombre,
              codigo: dispositivo.codigo,
              enRango: true,
              setPoint: dispositivo.ultimo_dato?.set_point,
              returnAir: dispositivo.ultimo_dato?.return_air,
            }).catch((e) => console.warn('[wa] control', e.message));
            continue;
          }
        } else {
          episode = ref.episode;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushEval(evaluaciones, {
          ...base,
          estado: 'sin_telemetria',
          accion: 'ninguna',
          enRango: false,
          diaCalendario: hoy,
          umbralesConfigurados: umbrales,
          telemetria: telem,
          criterio: `FUERA DE RANGO sin referencia. Error al consultar historial 12 h: ${msg}`,
        });
        result.resumen.sinTelemetria++;
        result.errors.push(`${base.descripcionEquipo}: historial — ${msg}`);
        continue;
      }

      const horasAcumuladasRaw = horasDesdeReferenciaEquipo(dispositivo, episode.since, now);
      const horasEnDia = horasEnDiaCalendario(episode.since, dispositivo, now);
      const horasEnteras = horasEnterasDesdeReferenciaEquipo(dispositivo, episode.since, now);
      const horasAcumuladas = Math.round(horasAcumuladasRaw * 10) / 10;
      void sincronizarControlWhatsapp({
        rowKey: assignment.rowKey,
        imei: dispositivo.imei,
        nombre: dispositivo.descripcion || dispositivo.nombre || assignment?.nombre,
        codigo: dispositivo.codigo,
        enRango: false,
        setPoint: dispositivo.ultimo_dato?.set_point,
        returnAir: dispositivo.ultimo_dato?.return_air,
      }).catch((e) => console.warn('[wa] control', e.message));
      const horasEnDiaReport = Math.round(horasEnDia * 10) / 10;
      ensureDailySentUmbrales(episode, now, horasEnDia);
      const planAviso = planUmbralAviso(umbrales, horasEnDia, episode.sentUmbrales ?? [], now, episode);
      caducarUmbrales(episode, planAviso.caducar);
      const sentUmbrales = episode.sentUmbrales ?? [];
      const umbralHoras = planAviso.enviar;
      const nextUmbral = proximoUmbralPendiente(umbrales, horasEnDia, sentUmbrales);
      const horasAcumTxt = `${horasAcumuladas} h acum.`;
      const horasDiaTxt = `${horasEnDiaReport} h hoy`;

      if (
        umbralHoras == null ||
        umbralYaEnviado(episode, umbralHoras) ||
        horasAcumuladas < umbralHoras
      ) {
        let criterio;
        if (sentUmbrales.length > 0) {
          const ultimo = sentUmbrales[sentUmbrales.length - 1];
          criterio = `FUERA DE RANGO ${horasDiaTxt} (${horasAcumTxt} desde ${formatRef(episode.since)}). Último aviso hoy: ${formatUmbralHoras(ultimo)}. ${nextUmbral != null ? `Esperando ${formatUmbralHoras(nextUmbral)} en ${hoy} (faltan ~${Math.max(0, nextUmbral - horasEnDia).toFixed(1)} h hoy).` : 'Sin más umbrales hoy.'}${textoEsperaUmbral(planAviso)}${textoCaducados(planAviso)} ${criterioRef}`;
        } else if (nextUmbral != null) {
          criterio = `FUERA DE RANGO ${horasDiaTxt} (${horasAcumTxt} desde ${formatRef(episode.since)}). Próximo aviso al alcanzar ${formatUmbralHoras(nextUmbral)} en ${hoy} (faltan ~${Math.max(0, nextUmbral - horasEnDia).toFixed(1)} h hoy). ${criterioRef}`;
        } else {
          criterio = `FUERA DE RANGO ${horasDiaTxt} (${horasAcumTxt} desde ${formatRef(episode.since)}). Sin umbrales pendientes hoy. ${criterioRef}`;
        }
        pushEval(evaluaciones, {
          ...base,
          estado: 'fuera_rango_sin_envio',
          accion: 'ninguna',
          enRango: false,
          diaCalendario: hoy,
          horasFueraHoy: horasEnteras,
          horasEnDiaCalendario: horasEnDiaReport,
          horasAcumuladas,
          referenciaDesde: episode.since,
          consultaHistorial,
          umbralesConfigurados: umbrales,
          umbralesEnviadosHoy: [...sentUmbrales],
          umbralesPendientes: [],
          proximoUmbralHoras: nextUmbral ?? null,
          telemetria: telem,
          criterio,
        });
        result.resumen.fueraRangoSinEnvio++;
        continue;
      }

      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      const tipoEvento = assignment.tipoEvento === 'mantenimiento' ? 'mantenimiento' : 'operaciones';

      {
        const trazabilidad = await fetchTrazabilidadCorreo(dispositivo, now);
        const trazEmail = await buildTrazabilidadForEmail(
          trazabilidad,
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma
        );
        const content = buildFueraDeRangoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasFueraRango: horasAcumuladas,
          horasEnDia: horasEnDiaReport,
          horasAcumuladas,
          diaCalendario: hoy,
          hoy,
          referenciaDesde: episode.since,
          tipoEvento,
          trazabilidad,
          ...trazEmail,
        });

        const envioId = uid('envio');
        const criterioEnvio = `FUERA DE RANGO ${horasDiaTxt} / ${horasAcumTxt} desde ${formatRef(episode.since)} (GMT-5). Se envía umbral ${formatUmbralHoras(umbralHoras)} del día ${hoy} (tipo ${tipoEvento}).${textoCaducados(planAviso)}${planAviso.diferirActual ? ` El umbral de ${formatUmbralHoras(planAviso.actual)} se envía 10 min después.` : ''} ${consultaHistorial ? 'Referencia por consulta 12 h.' : 'Referencia persistida.'} Destino: ${grupo.emails.join(', ')}.`;

        if (umbralYaEnviado(episode, umbralHoras)) {
          pushEval(evaluaciones, {
            ...base,
            estado: 'fuera_rango_sin_envio',
            accion: 'ninguna',
            enRango: false,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
            referenciaDesde: episode.since,
            consultaHistorial,
            umbralesEnviadosHoy: [...sentUmbrales],
            proximoUmbralHoras: nextUmbral ?? null,
            telemetria: telem,
            criterio: `Umbral ${formatUmbralHoras(umbralHoras)} ya enviado en este episodio. No se repite. ${criterioRef}`,
          });
          result.resumen.fueraRangoSinEnvio++;
          continue;
        }

        try {
          const messageId = await sendMail(smtp, grupo.emails, content);
          markUmbralEnviado(episode, umbralHoras, umbrales);
          cerrarEsperaUmbral(episode, planAviso, now);
          espejoWhatsapp({
            assignment,
            dispositivo,
            titulo: 'Fuera de rango',
            marca: `${episode.since}|${hoy}|${umbralHoras}`,
            detalle: detalleAlertaWhatsapp(
              'fuera de rango',
              episode.since,
              umbralHoras,
              horasAcumuladas,
              `Fuera de rango desde ${formatRef(episode.since)}. Lleva ${horasAcumuladas} h. Aviso de ${formatUmbralHoras(umbralHoras)}.`
            ),
            grupo,
          });

          addEnvio({
            id: envioId,
            alertKind: 'fuera_rango',
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            umbralHoras,
            horasFueraRango: horasAcumuladas,
            horasEnDiaCalendario: horasEnDiaReport,
            horasAcumuladas,
            referenciaDesde: episode.since,
            diaCalendario: hoy,
            tipoEvento,
            trazabilidad3h: trazabilidad,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            messageId,
            success: true,
          });

          const incidenteId = uid('inc');
          addIncidente({
            id: incidenteId,
            tipo: 'correo_enviado',
            envioId,
            alertKind: 'fuera_rango',
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            diaCalendario: hoy,
            umbralHoras,
            horasFueraRango: horasAcumuladas,
            horasEnDiaCalendario: horasEnDiaReport,
            horasAcumuladas,
            referenciaDesde: episode.since,
            trazabilidad3h: trazabilidad,
            tipoEvento,
            estado: 'pendiente',
            subject: content.subject,
            destinatarios: [...grupo.emails],
            enviadoAt: new Date().toISOString(),
            comentarios: [],
          });

          pushEval(evaluaciones, {
            ...base,
            estado: 'correo_enviado',
            accion: 'envio',
            enRango: false,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
            referenciaDesde: episode.since,
            consultaHistorial,
            umbralDisparado: umbralHoras,
            umbralesConfigurados: umbrales,
            umbralesEnviadosHoy: [...episode.sentUmbrales],
            tipoEvento,
            envioId,
            incidenteId,
            telemetria: telem,
            criterio: criterioEnvio,
          });

          result.emailsSent++;
          result.resumen.correoEnviado++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`${dispositivoReeferId} ${umbralHoras}h: ${msg}`);
          addEnvio({
            id: envioId,
            alertKind: 'fuera_rango',
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            codigo: dispositivo.codigo ?? '—',
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma,
            umbralHoras,
            horasFueraRango: horasAcumuladas,
            referenciaDesde: episode.since,
            diaCalendario: hoy,
            tipoEvento,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            success: false,
            error: msg,
          });
          pushEval(evaluaciones, {
            ...base,
            estado: 'error_envio',
            accion: 'error',
            enRango: false,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
            referenciaDesde: episode.since,
            consultaHistorial,
            umbralDisparado: umbralHoras,
            telemetria: telem,
            criterio: `${criterioEnvio} Error SMTP: ${msg}`,
          });
          result.resumen.errores++;
        }
      }
    }
  }

  await avisarCoberturaCiclica({ state, now, smtp, equipos: coberturaSilencio, result });

  saveState(state);
  result.finishedAt = new Date().toISOString();
  result.checkedAt = result.finishedAt;
  result.criterio = `Ciclo ${trigger}: ${result.devicesChecked} equipo(s) evaluados, ${result.emailsSent} correo(s), ${result.resumen.normal} normal(es).`;

  const ciclo = { ...result, evaluaciones };
  saveCiclo(ciclo);
  writeJson('lastRun.json', result);
  return ciclo;
}

export function getLastRun() {
  return readJson('lastRun.json', null);
}

export function getCicloById(id) {
  return getCiclos().find((c) => c.id === id) ?? null;
}

export function listCiclos(limit = 30) {
  return getCiclos().slice(0, Math.min(limit, MAX_CICLOS));
}

function findAssignmentByRowKey(rowKey) {
  for (const grupo of getGrupos()) {
    for (const assignment of grupo.devices ?? []) {
      if (assignment.rowKey === rowKey) return { grupo, assignment };
    }
  }
  return null;
}

function alertConfigLabel(rowKey, _ownerUsername = null) {
  const cfg = getDeviceAlertConfig(rowKey);
  return cfg?.mode === 'custom' ? 'personalizada' : 'estándar';
}

async function resolveDispositivoForRowKey(rowKey) {
  const dispositivos = await loadCurrentDispositivos();
  return dispositivos.find((d) => deviceRowKey(d) === rowKey) ?? null;
}

/**
 * Re-analiza historial 12 h y actualiza referencia del incidente activo.
 * Reinicia umbrales si detecta un nuevo intervalo fuera de rango.
 */
export async function refreshDeviceReferenceFromHistorial(rowKey) {
  const found = findAssignmentByRowKey(rowKey);
  if (!found) throw new Error('Equipo no encontrado en grupos de correo');

  const dispositivo = await resolveDispositivoForRowKey(rowKey);
  if (!dispositivo) throw new Error('Equipo sin telemetría actual');

  const now = new Date();
  const rangoOpts = resolveRangoOptsForDevice(rowKey, found.grupo.ownerUsername ?? null);
  const codigo = dispositivo.codigo ?? found.assignment.codigo;
  const hist = await fetchHistorialUltimasHoras(
    codigo,
    dispositivo.imei,
    HISTORICAL_WINDOW_HOURS,
    now
  );
  const since = resolveAlertOutOfRangeSince(hist.datos, now, rangoOpts);
  const state = getState();

  if (since == null) {
    const recovered = clearEpisode(state, rowKey, now, {
      imei: dispositivo.imei,
      codigo: dispositivo.codigo ?? '—',
    });
    saveState(state);
    return {
      rowKey,
      episode: null,
      recovered,
      since: null,
      consultaHistorial: true,
      criterio: 'Re-análisis 12 h (return_air): EN RANGO. Episodio cerrado.',
    };
  }

  let episode = getEpisode(state, rowKey);
  if (episode && episodeKind(episode) !== 'fuera_rango') episode = null;
  const prevSent = episode ? [...ensureSentUmbrales(episode)] : [];
  const reconciled = episode
    ? reconcileEpisodeReference(episode, hist.datos, now, rangoOpts)
    : { since, resetUmbrales: true };

  if (reconciled == null) {
    const recovered = clearEpisode(state, rowKey, now, {
      imei: dispositivo.imei,
      codigo: dispositivo.codigo ?? '—',
    });
    saveState(state);
    return {
      rowKey,
      episode: null,
      recovered,
      since: null,
      consultaHistorial: true,
      criterio: 'Re-análisis 12 h: recuperación EN RANGO.',
    };
  }

  const nextSent = reconciled.resetUmbrales ? [] : prevSent;
  if (episode) {
    episode.since = reconciled.since;
    episode.referenceLocked = true;
    episode.historialConsultadoAt = now.toISOString();
    episode.sentUmbrales = nextSent;
    if (reconciled.resetUmbrales) episode.sentUmbralesDay = todayKey(now);
  } else {
    episode = startEpisode(state, rowKey, reconciled.since, {
      fromHistorial: true,
      historialPuntos: hist.datos?.length ?? 0,
      now,
    });
    episode.sentUmbrales = nextSent;
  }

  saveState(state);
  return {
    rowKey,
    episode,
    since: reconciled.since,
    consultaHistorial: true,
    criterio: reconciled.resetUmbrales
      ? `Nuevo incidente ${formatRef(reconciled.since)}. Umbrales reiniciados.`
      : `Incidente activo ${formatRef(reconciled.since)}. Umbrales: ${nextSent.join(', ') || 'ninguno'}.`,
  };
}

/** Fija referencia manual; opcionalmente reinicia umbrales enviados. */
export function applyManualDeviceReference(rowKey, sinceIso, resetSentUmbrales = false) {
  const since = parseTelemetryDate(sinceIso);
  if (Number.isNaN(since.getTime())) throw new Error('Fecha de referencia inválida');

  const state = getState();
  let episode = getEpisode(state, rowKey);
  const prevSent = resetSentUmbrales ? [] : episode ? [...ensureSentUmbrales(episode)] : [];

  if (episode) {
    episode.since = since.toISOString();
    episode.referenceLocked = true;
    episode.referenciaManual = true;
    episode.sentUmbrales = prevSent;
    episode.sentUmbralesDay = todayKey();
  } else {
    episode = startEpisode(state, rowKey, since.toISOString(), {
      referenciaManual: true,
      referenceLocked: true,
    });
    episode.sentUmbrales = prevSent;
  }

  saveDeviceAlertConfig(rowKey, {
    mode: 'custom',
    useReferenciaManual: true,
    referenciaManual: since.toISOString(),
  });

  saveState(state);
  return {
    rowKey,
    episode,
    since: since.toISOString(),
    criterio: `Referencia manual ${formatRef(since.toISOString())}. Umbrales: ${prevSent.join(', ') || 'ninguno'}.`,
  };
}

export function archiveIncidente(id, usuario = 'sistema') {
  const all = getIncidentes();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('Incidente no encontrado');
  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    archivado: true,
    archivadoAt: now,
    archivadoPor: usuario,
  };
  writeJson('incidentes.json', all);
  return all[idx];
}

export function archiveAllIncidentes(usuario = 'sistema') {
  const all = getIncidentes();
  const now = new Date().toISOString();
  let count = 0;
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].archivado === true) continue;
    all[i] = {
      ...all[i],
      archivado: true,
      archivadoAt: now,
      archivadoPor: usuario,
    };
    count += 1;
  }
  writeJson('incidentes.json', all);
  return { count, archivadoAt: now };
}

export async function getDeviceEventosView(rowKey) {
  const found = findAssignmentByRowKey(rowKey);
  if (!found) throw new Error('Equipo no encontrado en grupos de correo');

  const dispositivo = await resolveDispositivoForRowKey(rowKey);
  if (!dispositivo) throw new Error('Equipo sin telemetría actual');

  const now = new Date();
  const rangoOpts = resolveRangoOptsForDevice(rowKey, found.grupo.ownerUsername ?? null);
  const codigo = dispositivo.codigo ?? found.assignment.codigo;
  const hist = await fetchHistorialUltimasHoras(
    codigo,
    dispositivo.imei,
    HISTORICAL_WINDOW_HOURS,
    now
  );
  const state = getState();
  const incidentes = getIncidentes()
    .filter((i) => i.rowKey === rowKey)
    .slice(0, 80);

  return {
    rowKey,
    imei: dispositivo.imei,
    codigo: dispositivo.codigo ?? found.assignment.codigo ?? '—',
    episode: state.episodes?.[rowKey] ?? null,
    lastRecovered: state.lastRecovered?.[rowKey] ?? null,
    intervalosFueraRango: computeOutOfRangeIntervals(hist.datos, rangoOpts, now),
    intervalosApagado: computeApagadoIntervals(
      hist.datos,
      now,
      dispositivo.codigo ?? found.assignment.codigo
    ),
    incidentes,
    historialPuntos: hist.datos?.length ?? 0,
    consultadoAt: now.toISOString(),
  };
}

export function getAlertStateView(actorUsername = null) {
  const state = getState();
  const configs = getDeviceAlertConfigMap();
  const seen = new Set();
  const entries = [];

  for (const grupo of getGrupos()) {
    for (const assignment of grupo.devices ?? []) {
      if (seen.has(assignment.rowKey)) continue;
      seen.add(assignment.rowKey);
      const episode = state.episodes?.[assignment.rowKey] ?? null;
      const raw = configs[assignment.rowKey] ?? null;
      let config = raw;
      if (actorUsername) {
        const owner = raw?.ownerUsername?.toString().trim().toLowerCase();
        const want = String(actorUsername).trim().toLowerCase();
        if (!owner || owner !== want) config = null;
      } else if (grupo.ownerUsername && raw?.ownerUsername) {
        const owner = String(raw.ownerUsername).trim().toLowerCase();
        const want = String(grupo.ownerUsername).trim().toLowerCase();
        if (owner !== want) config = null;
      }
      entries.push({
        rowKey: assignment.rowKey,
        imei: assignment.imei,
        codigo: assignment.codigo,
        descripcionEquipo: assignment.descripcionEquipo,
        nombrePlataforma: assignment.nombrePlataforma,
        grupoNombre: grupo.nombre,
        config,
        episode,
        lastRecovered: state.lastRecovered?.[assignment.rowKey] ?? null,
      });
    }
  }

  return { entries, updatedAt: new Date().toISOString() };
}

export {
  getGrupos,
  getEnvios,
  getIncidentes,
  addIncidente,
  getCiclos,
};
