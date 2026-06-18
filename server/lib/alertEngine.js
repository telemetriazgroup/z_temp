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
import { getSmtpConfig } from './smtpRepository.js';
import {
  fetchHistorialUltimasHoras,
  resolveOutOfRangeSince,
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

function clearEpisode(state, rowKey, now) {
  const ep = state.episodes?.[rowKey];
  if (!ep) return null;
  const endedAt = now.toISOString();
  const durationHours = horasDesdeReferencia(ep.since, now);
  if (!state.lastRecovered) state.lastRecovered = {};
  state.lastRecovered[rowKey] = {
    since: ep.since,
    endedAt,
    durationHours: Math.round(durationHours * 10) / 10,
  };
  delete state.episodes[rowKey];
  return state.lastRecovered[rowKey];
}

function startEpisode(state, rowKey, since, meta = {}) {
  if (!state.episodes) state.episodes = {};
  state.episodes[rowKey] = {
    since,
    sentUmbrales: [],
    establishedAt: new Date().toISOString(),
    ...meta,
  };
  return state.episodes[rowKey];
}

function formatRef(iso) {
  try {
    return new Date(iso).toLocaleString('es-ES');
  } catch {
    return iso;
  }
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

function resolveLabels(assignment) {
  const desc = assignment.descripcionEquipo?.trim();
  const platform = desc || assignment.imei;
  return {
    dispositivoReeferId: desc || platform,
    nombrePlataforma: platform,
  };
}

async function ensureOutOfRangeReference(state, assignment, dispositivo, now) {
  let episode = getEpisode(state, assignment.rowKey);
  if (episode) {
    return {
      episode,
      consultaHistorial: false,
      criterioRef: `Referencia persistida desde ${formatRef(episode.since)}. No se consulta historial.`,
    };
  }

  const codigo = dispositivo.codigo ?? assignment.codigo;
  const hist = await fetchHistorialUltimasHoras(codigo, dispositivo.imei, HISTORICAL_WINDOW_HOURS, now);
  const since = resolveOutOfRangeSince(hist.datos, now);

  if (since) {
    episode = startEpisode(state, assignment.rowKey, since, {
      fromHistorial: true,
      historialPuntos: hist.datos?.length ?? 0,
    });
    return {
      episode,
      consultaHistorial: true,
      criterioRef: `Consulta últimas ${HISTORICAL_WINDOW_HOURS} h (${formatRef(hist.fecha_inicial)} → ${formatRef(hist.fecha_final)}): fuera de rango desde ${formatRef(since)}.`,
    };
  }

  const fallbackSince = now.toISOString();
  episode = startEpisode(state, assignment.rowKey, fallbackSince, {
    fromHistorial: false,
    fallback: true,
  });
  return {
    episode,
    consultaHistorial: true,
    criterioRef: `Consulta últimas ${HISTORICAL_WINDOW_HOURS} h sin punto claro de inicio; referencia desde ahora (${formatRef(fallbackSince)}).`,
  };
}

function baseEval(grupo, assignment) {
  const { dispositivoReeferId } = resolveLabels(assignment);
  return {
    rowKey: assignment.rowKey,
    imei: assignment.imei,
    codigo: assignment.codigo ?? '—',
    grupoId: grupo.id,
    grupoNombre: grupo.nombre,
    descripcionEquipo: dispositivoReeferId,
    assignmentEnabled: assignment.enabled,
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
      const base = baseEval(grupo, assignment);

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
      const dispositivo = deviceMap.get(assignment.rowKey);

      if (!dispositivo) {
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

      const enRango = dispositivo.en_rango;
      const umbrales = normalizeUmbrales(assignment.umbralesHoras);
      const telem = {
        setPoint: dispositivo.ultimo_dato?.set_point ?? null,
        tempSupply: dispositivo.ultimo_dato?.temp_supply_1 ?? null,
        returnAir: dispositivo.ultimo_dato?.return_air ?? null,
        ultimaActualizacion: dispositivo.ultima_actualizacion ?? null,
        estadoConexion: dispositivo.estado_conexion ?? null,
      };

      if (enRango === true) {
        const recovered = clearEpisode(state, assignment.rowKey, now);
        let criterio;
        if (recovered) {
          criterio = `EN RANGO. Equipo recuperado; episodio cerrado (estuvo fuera desde ${formatRef(recovered.since)} hasta ${formatRef(recovered.endedAt)}, ~${recovered.durationHours} h). No se consulta historial.`;
        } else {
          criterio = 'EN RANGO. Temperatura dentro de parámetros. No se consulta historial ni se envía correo.';
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

      if (enRango !== false) {
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
        episode = ref.episode;
        consultaHistorial = ref.consultaHistorial;
        criterioRef = ref.criterioRef;
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
      const horasEnteras = horasEnterasDesdeReferencia(episode.since, now);
      const sentUmbrales = episode.sentUmbrales ?? [];
      const pending = umbrales.filter((u) => horasEnteras >= u && !sentUmbrales.includes(u));
      const nextUmbral = umbrales.find((u) => horasEnteras < u);
      const horasTexto =
        horasFuera >= 10
          ? `${Math.round(horasFuera * 10) / 10} h`
          : `${Math.round(horasFuera * 10) / 10} h`;

      if (pending.length === 0) {
        let criterio;
        if (sentUmbrales.length > 0) {
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)}. Umbrales ya notificados en este episodio: ${sentUmbrales.join(', ')} h. ${criterioRef}`;
        } else if (nextUmbral != null) {
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)}. Próximo aviso al alcanzar ${nextUmbral} h (faltan ~${Math.max(0, nextUmbral - horasFuera).toFixed(1)} h). ${criterioRef}`;
        } else {
          criterio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)}. Sin umbrales pendientes. ${criterioRef}`;
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

      const { dispositivoReeferId, nombrePlataforma } = resolveLabels(assignment);
      const tipoEvento = assignment.tipoEvento === 'mantenimiento' ? 'mantenimiento' : 'operaciones';

      for (const umbralHoras of pending) {
        const content = buildFueraDeRangoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma,
          cliente: grupo.cliente?.trim() || 'Cliente',
          umbralHoras,
          horasFueraRango: horasEnteras,
          diaCalendario: hoy,
          hoy,
          tipoEvento,
        });

        const envioId = uid('envio');
        const criterioEnvio = `FUERA DE RANGO ${horasTexto} desde ${formatRef(episode.since)}. Se dispara umbral ${umbralHoras} h (tipo ${tipoEvento}). ${consultaHistorial ? 'Referencia obtenida por consulta 12 h.' : 'Referencia persistida.'} Envío a ${grupo.emails.join(', ')}.`;

        try {
          const messageId = await sendMail(smtp, grupo.emails, content);
          if (!episode.sentUmbrales.includes(umbralHoras)) {
            episode.sentUmbrales.push(umbralHoras);
          }

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

export {
  getGrupos,
  getEnvios,
  getIncidentes,
  addIncidente,
  getCiclos,
};
