import nodemailer from 'nodemailer';
import {
  readJson,
  writeJson,
  uid,
  normalizeUmbrales,
  todayKey,
  formatUmbralHoras,
} from './store.js';
import { formatDateTimeTz } from './timezone.js';
import { buildFueraDeRangoEmail, buildApagadoEmail } from './emailBuilder.js';
import { fetchAllDispositivos, deviceRowKey } from './telemetry.js';
import { getSmtpConfig } from './smtpRepository.js';
import { getDeviceNameByImei } from './deviceNamesRepository.js';
import { resolveUmbralesForDevice, getDeviceAlertConfig, getDeviceAlertConfigMap, saveDeviceAlertConfig, resolveRangoOptsForDevice } from './deviceAlertConfigRepository.js';
import { isEquipoApagado, isEquipoEncendido, defrostActivoEfectivo } from './powerState.js';
import {
  fetchHistorialUltimasHoras,
  resolveAlertOutOfRangeSince,
  effectiveEnRangoAlertaFromDispositivo,
  reconcileEpisodeReference,
  computeOutOfRangeIntervals,
  computeApagadoIntervals,
  horasDesdeReferencia,
  horasEnterasDesdeReferencia,
  HISTORICAL_WINDOW_HOURS,
} from './historicalTelemetry.js';

const MAX_CICLOS = 200;

function getGrupos() {
  return readJson('grupos.json', []);
}

function getState() {
  return readJson('state.json', { episodes: {}, lastRecovered: {} });
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
  if (episode && episodeKind(episode) === 'apagado') return episode;
  if (episode) clearEpisode(state, rowKey, now);
  return startEpisode(state, rowKey, now.toISOString(), {
    kind: 'apagado',
    referenceLocked: true,
  });
}

function startEpisode(state, rowKey, since, meta = {}) {
  if (!state.episodes) state.episodes = {};
  state.episodes[rowKey] = {
    since,
    sentUmbrales: [],
    kind: 'fuera_rango',
    referenceLocked: true,
    historialConsultadoAt: new Date().toISOString(),
    establishedAt: new Date().toISOString(),
    ...meta,
  };
  return state.episodes[rowKey];
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
    [nombreAsignado, fromServer].find((v) => v && v !== 'SIN ASIGNAR') ?? fallbackTecnico;

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

/** Solo el mayor umbral alcanzado y aún no notificado en el episodio. */
function pickUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales) {
  const eligible = umbrales.filter((u) => horasTranscurridas >= u && !sentUmbrales.includes(u));
  if (eligible.length === 0) return null;
  return Math.max(...eligible);
}

function proximoUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales) {
  return umbrales.find((u) => horasTranscurridas < u && !sentUmbrales.includes(u)) ?? null;
}

async function ensureOutOfRangeReference(state, assignment, dispositivo, now) {
  const cfg = getDeviceAlertConfig(assignment.rowKey);
  const rangoOpts = resolveRangoOptsForDevice(assignment.rowKey);
  let episode = getEpisode(state, assignment.rowKey);
  episode = episode && episodeKind(episode) === 'fuera_rango' ? episode : null;

  if (cfg?.mode === 'custom' && cfg.useReferenciaManual && cfg.referenciaManual) {
    if (!episode) {
      episode = startEpisode(state, assignment.rowKey, cfg.referenciaManual, {
        referenciaManual: true,
        referenceLocked: true,
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
    if (episode) {
      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      clearEpisode(state, assignment.rowKey, now, {
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
      recovered: true,
      consultaHistorial: true,
      criterioRef:
        'Consulta 12 h (return_air): EN RANGO. Episodio cerrado; contador de umbrales en 0.',
    };
  }

  if (episode) {
    const reconciled = reconcileEpisodeReference(episode, hist.datos, now, rangoOpts);
    if (reconciled == null) {
      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
      clearEpisode(state, assignment.rowKey, now, {
        imei: dispositivo.imei,
        codigo: dispositivo.codigo ?? '—',
        descripcionEquipo: dispositivoReeferId,
        nombrePlataforma,
      });
      return {
        episode: null,
        recovered: true,
        consultaHistorial: true,
        criterioRef: 'Historial indica recuperación EN RANGO. Episodio cerrado.',
      };
    }

    if (reconciled.resetUmbrales) {
      episode.since = reconciled.since;
      episode.sentUmbrales = [];
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
    configAlerta: alertConfigLabel(assignment.rowKey),
  };
}

function pushEval(evaluaciones, eval_) {
  evaluaciones.push(eval_);
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

/**
 * @param {{ trigger?: 'automatic' | 'manual' }} [options]
 */
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
    dispositivos = await fetchAllDispositivos();
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

  for (const grupo of allGrupos) {
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

      result.devicesChecked++;

      if (dispositivo == null) {
        pushEval(evaluaciones, {
          ...base,
          estado: 'sin_telemetria',
          accion: 'ninguna',
          enRango: null,
          criterio:
            'No aparece en la telemetría actual (TUNEL/STARCOOL/TERMOKING). No se puede evaluar en_rango.',
        });
        result.resumen.sinTelemetria++;
        continue;
      }

      const rangoOpts = resolveRangoOptsForDevice(assignment.rowKey);
      const enRangoRaw = dispositivo.en_rango;
      const enRangoEfectivo = effectiveEnRangoAlertaFromDispositivo(dispositivo, rangoOpts);
      const umbrales = resolveUmbralesForDevice(assignment.rowKey, assignment.umbralesHoras);
      const telem = {
        setPoint: dispositivo.ultimo_dato?.set_point ?? null,
        tempSupply: dispositivo.ultimo_dato?.temp_supply_1 ?? null,
        returnAir: dispositivo.ultimo_dato?.return_air ?? null,
        ultimaActualizacion: dispositivo.ultima_actualizacion ?? null,
        estadoConexion: dispositivo.estado_conexion ?? null,
        enDefrost: dispositivo.en_defrost ?? null,
        powerState: dispositivo.ultimo_dato?.power_state ?? null,
      };

      if (isEquipoApagado(dispositivo) === true) {
        clearEpisodeIfKind(state, assignment.rowKey, 'fuera_rango', now);
        const episode = ensureApagadoEpisode(state, assignment.rowKey, now);
        const horasTranscurridas = horasDesdeReferencia(episode.since, now);
        const horasEnteras = horasEnterasDesdeReferencia(episode.since, now);
        const horasTexto = `${Math.round(horasTranscurridas * 10) / 10} h`;
        const sentUmbrales = episode.sentUmbrales ?? [];
        const umbralHoras = pickUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales);
        const nextUmbral = proximoUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales);
        const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
        const tipoEvento =
          assignment.tipoEvento === 'mantenimiento' ? 'mantenimiento' : 'operaciones';

        if (umbralHoras == null || umbralYaEnviado(episode, umbralHoras)) {
          const criterio =
            sentUmbrales.length > 0
              ? `APAGADO (power_state 0) ${horasTexto} desde ${formatRef(episode.since)}. Último aviso apagado: ${formatUmbralHoras(sentUmbrales[sentUmbrales.length - 1])}. ${nextUmbral != null ? `Esperando ${formatUmbralHoras(nextUmbral)}.` : 'Sin más umbrales.'} No se evalúa fuera de rango mientras esté OFF.`
              : `APAGADO (power_state 0) ${horasTexto} desde ${formatRef(episode.since)}. ${nextUmbral != null ? `Próximo aviso al alcanzar ${formatUmbralHoras(nextUmbral)}.` : 'Sin umbrales pendientes.'} Fuera de rango solo con equipo ON.`;
          pushEval(evaluaciones, {
            ...base,
            estado: 'equipo_apagado',
            accion: 'ninguna',
            enRango: null,
            diaCalendario: hoy,
            horasFueraHoy: horasEnteras,
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

        const content = buildApagadoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasApagado: horasEnteras,
          diaCalendario: hoy,
          hoy,
          referenciaDesde: episode.since,
          tipoEvento,
        });
        const envioId = uid('envio');
        const criterioEnvio = `APAGADO ${horasTexto} desde ${formatRef(episode.since)} (GMT-5). Se envía alerta APAGADO umbral ${formatUmbralHoras(umbralHoras)}. No se envía fuera de rango. Destino: ${grupo.emails.join(', ')}.`;

        try {
          const messageId = await sendMail(smtp, grupo.emails, content);
          markUmbralEnviado(episode, umbralHoras, umbrales);
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
            horasFueraRango: horasEnteras,
            referenciaDesde: episode.since,
            diaCalendario: hoy,
            tipoEvento,
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
            horasFueraRango: horasEnteras,
            referenciaDesde: episode.since,
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

      if (enRangoEfectivo === true) {
        const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment, dispositivo);
        const recovered = clearEpisode(state, assignment.rowKey, now, {
          imei: dispositivo.imei,
          codigo: dispositivo.codigo ?? '—',
          descripcionEquipo: dispositivoReeferId,
          nombrePlataforma,
          grupoId: grupo.id,
          grupoNombre: grupo.nombre,
        });
        let criterio;
        if (recovered?.kind === 'fuera_rango') {
          criterio = `EN RANGO (return_air). Incidente cerrado (fuera desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)}, ~${recovered.durationHours} h). Umbrales reiniciados.`;
        } else if (recovered) {
          criterio = `EN RANGO (return_air). Episodio ${recovered.kind} cerrado. Contador en 0.`;
        } else if (defrostActivoEfectivo(dispositivo)) {
          criterio =
            'EN RANGO (defrost activo con equipo ON). No se alerta fuera de rango.';
        } else {
          criterio = 'EN RANGO (return_air). Temperatura dentro de parámetros. No se envía correo.';
        }
        pushEval(evaluaciones, {
          ...base,
          estado: 'normal',
          accion: 'ninguna',
          enRango: true,
          diaCalendario: hoy,
          umbralesConfigurados: umbrales,
          referenciaDesde: recovered?.since ?? null,
          recuperadoAt: recovered?.endedAt ?? null,
          telemetria: telem,
          criterio,
        });
        result.resumen.normal++;
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
        const ref = await ensureOutOfRangeReference(state, assignment, dispositivo, now);
        consultaHistorial = ref.consultaHistorial;
        criterioRef = ref.criterioRef;

        if (ref.recovered || ref.episode == null) {
          pushEval(evaluaciones, {
            ...base,
            estado: 'normal',
            accion: 'ninguna',
            enRango: true,
            diaCalendario: hoy,
            umbralesConfigurados: umbrales,
            consultaHistorial,
            telemetria: telem,
            criterio: criterioRef,
          });
          result.resumen.normal++;
          continue;
        }

        episode = ref.episode;
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

      const horasFuera = horasDesdeReferencia(episode.since, now);
      const horasTranscurridas = horasFuera;
      const horasEnteras = horasEnterasDesdeReferencia(episode.since, now);
      const sentUmbrales = episode.sentUmbrales ?? [];
      const umbralHoras = pickUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales);
      const nextUmbral = proximoUmbralPendiente(umbrales, horasTranscurridas, sentUmbrales);
      const horasTexto = `${Math.round(horasFuera * 10) / 10} h`;

      if (umbralHoras == null || umbralYaEnviado(episode, umbralHoras)) {
        let criterio;
        if (sentUmbrales.length > 0) {
          const ultimo = sentUmbrales[sentUmbrales.length - 1];
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)} (GMT-5). Último aviso: ${formatUmbralHoras(ultimo)}. ${nextUmbral != null ? `Esperando ${formatUmbralHoras(nextUmbral)} (${Math.max(0, nextUmbral - horasFuera).toFixed(1)} h restantes).` : 'Sin más umbrales.'} ${criterioRef}`;
        } else if (nextUmbral != null) {
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)} (GMT-5). Próximo aviso al alcanzar ${nextUmbral} h (faltan ~${Math.max(0, nextUmbral - horasFuera).toFixed(1)} h). ${criterioRef}`;
        } else {
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)} (GMT-5). Sin umbrales pendientes. ${criterioRef}`;
        }
        pushEval(evaluaciones, {
          ...base,
          estado: 'fuera_rango_sin_envio',
          accion: 'ninguna',
          enRango: false,
          diaCalendario: hoy,
          horasFueraHoy: horasEnteras,
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
        const content = buildFueraDeRangoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasFueraRango: horasEnteras,
          diaCalendario: hoy,
          hoy,
          referenciaDesde: episode.since,
          tipoEvento,
        });

        const envioId = uid('envio');
        const criterioEnvio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)} (GMT-5). Se envía solo umbral ${formatUmbralHoras(umbralHoras)} (tipo ${tipoEvento}). ${consultaHistorial ? 'Referencia obtenida por consulta 12 h (fijada).' : 'Referencia persistida.'} Destino: ${grupo.emails.join(', ')}.`;

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
            horasFueraRango: horasEnteras,
            referenciaDesde: episode.since,
            diaCalendario: hoy,
            tipoEvento,
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
            horasFueraRango: horasEnteras,
            referenciaDesde: episode.since,
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
            horasFueraRango: horasEnteras,
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

function alertConfigLabel(rowKey) {
  const cfg = getDeviceAlertConfig(rowKey);
  return cfg?.mode === 'custom' ? 'personalizada' : 'estándar';
}

async function resolveDispositivoForRowKey(rowKey) {
  const dispositivos = await fetchAllDispositivos();
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
  const rangoOpts = resolveRangoOptsForDevice(rowKey);
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
  } else {
    episode = startEpisode(state, rowKey, reconciled.since, {
      fromHistorial: true,
      historialPuntos: hist.datos?.length ?? 0,
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
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) throw new Error('Fecha de referencia inválida');

  const state = getState();
  let episode = getEpisode(state, rowKey);
  const prevSent = resetSentUmbrales ? [] : episode ? [...ensureSentUmbrales(episode)] : [];

  if (episode) {
    episode.since = since.toISOString();
    episode.referenceLocked = true;
    episode.referenciaManual = true;
    episode.sentUmbrales = prevSent;
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
  const rangoOpts = resolveRangoOptsForDevice(rowKey);
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
    intervalosApagado: computeApagadoIntervals(hist.datos, now),
    incidentes,
    historialPuntos: hist.datos?.length ?? 0,
    consultadoAt: now.toISOString(),
  };
}

export function getAlertStateView() {
  const state = getState();
  const configs = getDeviceAlertConfigMap();
  const seen = new Set();
  const entries = [];

  for (const grupo of getGrupos()) {
    for (const assignment of grupo.devices ?? []) {
      if (seen.has(assignment.rowKey)) continue;
      seen.add(assignment.rowKey);
      const episode = state.episodes?.[assignment.rowKey] ?? null;
      entries.push({
        rowKey: assignment.rowKey,
        imei: assignment.imei,
        codigo: assignment.codigo,
        descripcionEquipo: assignment.descripcionEquipo,
        nombrePlataforma: assignment.nombrePlataforma,
        grupoNombre: grupo.nombre,
        config: configs[assignment.rowKey] ?? null,
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
