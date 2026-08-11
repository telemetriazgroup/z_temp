/**
 * Snapshot de alertas por correo para consumo por aplicaciones externas.
 */
import { readJson } from './store.js';
import {
  getGrupos,
  getEnvios,
  getLastRun,
  listCiclos,
  getCicloById,
} from './alertEngine.js';
import {
  getDeviceAlertConfigMap,
  resolveUmbralesForDevice,
  resolveRangoOptsForDevice,
} from './deviceAlertConfigRepository.js';
import { getDeviceNameByImei } from './deviceNamesRepository.js';
import { fetchAllDispositivos, deviceRowKey } from './telemetry.js';
import {
  fetchHistorialUltimasHoras,
  effectiveEnRangoAlertaFromDispositivo,
  HISTORICAL_WINDOW_HOURS,
  prepareHistorialTrazabilidad,
} from './historicalTelemetry.js';
import { computeRangoLimites } from './rangoTemperatura.js';

function compactSampleRow(row) {
  if (row == null) return null;
  return {
    created_at: row.created_at ?? row.fecha ?? null,
    set_point: row.set_point ?? null,
    return_air: row.return_air ?? null,
    temp_supply_1: row.temp_supply_1 ?? null,
    evaporation_coil: row.evaporation_coil ?? null,
    power_state: row.power_state ?? null,
    en_rango: row.en_rango ?? null,
  };
}

function compactTrazabilidad(traz) {
  if (traz == null) return null;
  const puntos = traz.puntosTabla ?? traz.puntos ?? [];
  return {
    ventanaHoras: traz.ventanaHoras ?? null,
    generadoAt: traz.generadoAt ?? null,
    totalPuntos: puntos.length,
    puntos: puntos.map((p) => ({
      ts: p.ts ?? null,
      fecha: p.fecha ?? null,
      hora: p.hora ?? p.horaCompleta ?? null,
      setPoint: p.setPoint ?? null,
      returnAir: p.returnAir ?? null,
      tempSupply: p.tempSupply ?? null,
      evaporatorCoil: p.evaporatorCoil ?? null,
      powerState: p.powerState ?? null,
      enRango: p.enRango ?? null,
    })),
  };
}

function resolveUltimoCicloConEvaluaciones(lastRun) {
  if (lastRun?.id) {
    const byId = getCicloById(lastRun.id);
    if (byId?.evaluaciones?.length) return byId;
  }
  const recientes = listCiclos(10);
  return recientes.find((c) => Array.isArray(c.evaluaciones) && c.evaluaciones.length > 0) ?? recientes[0] ?? null;
}

/**
 * @param {{
 *   ultimasAlertas?: number,
 *   includeHistorialMuestras?: boolean,
 *   historialHoras?: number,
 *   pollMs?: number,
 * }} [options]
 */
export async function buildExternalAlertMonitor(options = {}) {
  const ultimasAlertas = Math.min(Math.max(Number(options.ultimasAlertas ?? 5), 1), 50);
  const includeHistorialMuestras = Boolean(options.includeHistorialMuestras);
  const historialHoras = Math.min(
    Math.max(Number(options.historialHoras ?? HISTORICAL_WINDOW_HOURS), 1),
    48
  );
  const pollMs = options.pollMs ?? null;
  const generatedAt = new Date().toISOString();

  const lastRun = getLastRun();
  const ciclo = resolveUltimoCicloConEvaluaciones(lastRun);
  const configs = getDeviceAlertConfigMap();
  const state = readJson('state.json', {
    episodes: {},
    lastRecovered: {},
    offline: {},
    offlineOps: {},
  });

  let dispositivos = [];
  let telemetriaError = null;
  try {
    dispositivos = await fetchAllDispositivos();
  } catch (e) {
    telemetriaError = e instanceof Error ? e.message : String(e);
  }
  const deviceMap = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));

  const evalByRowKey = new Map();
  for (const ev of ciclo?.evaluaciones ?? []) {
    if (ev?.rowKey) evalByRowKey.set(ev.rowKey, ev);
  }

  const equiposProgramados = [];
  const seen = new Set();

  for (const grupo of getGrupos()) {
    if (!grupo.enabled) continue;
    for (const assignment of grupo.devices ?? []) {
      const rowKey = assignment.rowKey;
      if (!rowKey || seen.has(rowKey)) continue;
      seen.add(rowKey);

      const dispositivo = deviceMap.get(rowKey) ?? null;
      const cfg = configs[rowKey] ?? null;
      const umbralesHoras = resolveUmbralesForDevice(
        rowKey,
        assignment.umbralesHoras
      );
      const rangoOpts = resolveRangoOptsForDevice(rowKey);
      const setPoint = dispositivo?.ultimo_dato?.set_point ?? null;
      const rangoProgramado = computeRangoLimites(setPoint, rangoOpts);
      const enRangoEfectivo = dispositivo
        ? effectiveEnRangoAlertaFromDispositivo(dispositivo, rangoOpts)
        : null;
      const evalCiclo = evalByRowKey.get(rowKey) ?? null;
      const nombreAsignado =
        assignment.nombrePlataforma?.trim() ||
        getDeviceNameByImei(assignment.imei) ||
        assignment.descripcionEquipo ||
        null;

      equiposProgramados.push({
        rowKey,
        imei: assignment.imei,
        codigo: assignment.codigo ?? dispositivo?.codigo ?? null,
        enabled: assignment.enabled !== false,
        grupoId: grupo.id,
        grupoNombre: grupo.nombre,
        destinatariosGrupo: [...(grupo.emails ?? [])],
        cliente: grupo.cliente ?? null,
        nombrePlataforma: nombreAsignado,
        descripcionEquipo: assignment.descripcionEquipo ?? null,
        umbralesHoras,
        configuracionAlerta: cfg
          ? {
              mode: cfg.mode ?? 'standard',
              umbralesHoras: cfg.umbralesHoras ?? null,
              alerta30Minutos: Boolean(cfg.alerta30Minutos),
              alerta1Hora: Boolean(cfg.alerta1Hora),
              useRangoPersonalizado: Boolean(cfg.useRangoPersonalizado),
              margenInferior: cfg.margenInferior ?? null,
              margenSuperior: cfg.margenSuperior ?? null,
              useReferenciaManual: Boolean(cfg.useReferenciaManual),
              referenciaManual: cfg.referenciaManual ?? null,
              updatedAt: cfg.updatedAt ?? null,
            }
          : {
              mode: 'standard',
              umbralesHoras: null,
              alerta30Minutos: false,
              alerta1Hora: false,
              useRangoPersonalizado: false,
              margenInferior: null,
              margenSuperior: null,
              nota: 'Sin overrides; usa umbrales del grupo/estándar y banda ±10% setpoint',
            },
        rangoProgramado: rangoProgramado
          ? {
              setPoint: rangoProgramado.setPoint,
              min: rangoProgramado.min,
              max: rangoProgramado.max,
              margenInferior: rangoProgramado.margenInferior,
              margenSuperior: rangoProgramado.margenSuperior,
              personalizado: rangoProgramado.personalizado,
              metricaGuia: 'return_air',
            }
          : null,
        enRango: enRangoEfectivo,
        telemetriaActual: dispositivo
          ? {
              estado_conexion: dispositivo.estado_conexion ?? null,
              ultima_actualizacion: dispositivo.ultima_actualizacion ?? null,
              minutos_desde_ultimo_dato:
                dispositivo.minutos_desde_ultimo_dato ?? null,
              power_state: dispositivo.ultimo_dato?.power_state ?? null,
              set_point: dispositivo.ultimo_dato?.set_point ?? null,
              return_air: dispositivo.ultimo_dato?.return_air ?? null,
              temp_supply_1: dispositivo.ultimo_dato?.temp_supply_1 ?? null,
              evaporation_coil: dispositivo.ultimo_dato?.evaporation_coil ?? null,
              en_defrost: dispositivo.en_defrost ?? null,
            }
          : null,
        episodioActivo: state.episodes?.[rowKey] ?? null,
        ultimaRecuperacion: state.lastRecovered?.[rowKey] ?? null,
        ultimaEvaluacionCiclo: evalCiclo
          ? {
              cicloId: ciclo?.id ?? null,
              estado: evalCiclo.estado ?? null,
              accion: evalCiclo.accion ?? null,
              enRango: evalCiclo.enRango ?? null,
              criterio: evalCiclo.criterio ?? null,
              umbralDisparado: evalCiclo.umbralDisparado ?? null,
              umbralesConfigurados: evalCiclo.umbralesConfigurados ?? null,
              referenciaDesde: evalCiclo.referenciaDesde ?? null,
              telemetria: evalCiclo.telemetria ?? null,
              consultaHistorial: evalCiclo.consultaHistorial ?? null,
            }
          : null,
      });
    }
  }

  const ultimasAlertasEnviadas = getEnvios()
    .filter((e) => e.success !== false)
    .slice(0, ultimasAlertas)
    .map((e) => ({
      id: e.id,
      alertKind: e.alertKind,
      sentAt: e.sentAt,
      subject: e.subject,
      rowKey: e.rowKey,
      imei: e.imei,
      codigo: e.codigo,
      descripcionEquipo: e.descripcionEquipo,
      nombrePlataforma: e.nombrePlataforma,
      grupoId: e.grupoId,
      grupoNombre: e.grupoNombre,
      umbralHoras: e.umbralHoras ?? null,
      horasAcumuladas: e.horasAcumuladas ?? e.horasFueraRango ?? null,
      horasOffline: e.horasOffline ?? null,
      referenciaDesde: e.referenciaDesde ?? null,
      destinatarios: e.destinatarios ?? [],
      destinatarioTipo: e.destinatarioTipo ?? null,
      messageId: e.messageId ?? null,
      muestrasUsadas: compactTrazabilidad(e.trazabilidad3h),
    }));

  const muestrasDecision = {
    descripcion:
      'Muestras usadas por el motor de alertas: telemetría del último ciclo y trazabilidad adjunta a las últimas alertas enviadas.',
    ultimoCicloId: ciclo?.id ?? null,
    ultimoCicloAt: ciclo?.finishedAt ?? ciclo?.checkedAt ?? null,
    evaluacionesCiclo: (ciclo?.evaluaciones ?? []).map((ev) => ({
      rowKey: ev.rowKey,
      imei: ev.imei,
      codigo: ev.codigo,
      grupoId: ev.grupoId,
      estado: ev.estado,
      accion: ev.accion,
      enRango: ev.enRango,
      criterio: ev.criterio,
      umbralDisparado: ev.umbralDisparado ?? null,
      referenciaDesde: ev.referenciaDesde ?? null,
      consultaHistorial: ev.consultaHistorial ?? null,
      muestraTelemetria: ev.telemetria ?? null,
    })),
    muestrasEnAlertasEnviadas: ultimasAlertasEnviadas.map((a) => ({
      envioId: a.id,
      rowKey: a.rowKey,
      alertKind: a.alertKind,
      sentAt: a.sentAt,
      muestras: a.muestrasUsadas,
    })),
    historialConsultado: null,
  };

  if (includeHistorialMuestras) {
    const historialConsultado = [];
    const unique = equiposProgramados.filter((e) => e.enabled);
    const settled = await Promise.allSettled(
      unique.map(async (eq) => {
        const codigo = eq.codigo;
        if (!codigo || !eq.imei) {
          return {
            rowKey: eq.rowKey,
            error: 'Sin codigo/imei',
            muestras: [],
          };
        }
        const hist = await fetchHistorialUltimasHoras(
          codigo,
          eq.imei,
          historialHoras,
          new Date()
        );
        const datos = hist.datos ?? [];
        const traz = prepareHistorialTrazabilidad(datos, new Date(), Math.min(historialHoras, 3));
        return {
          rowKey: eq.rowKey,
          imei: eq.imei,
          codigo,
          ventanaHoras: historialHoras,
          totalRegistros: datos.length,
          muestras: datos.slice(0, 200).map(compactSampleRow),
          trazabilidadResumen: compactTrazabilidad(traz),
        };
      })
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') historialConsultado.push(r.value);
      else {
        historialConsultado.push({
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          muestras: [],
        });
      }
    }
    muestrasDecision.historialConsultado = {
      horas: historialHoras,
      equipos: historialConsultado,
    };
  }

  return {
    generatedAt,
    aplicacion: {
      servicio: 'ztrack-correo',
      pollMs,
      zonaHoraria: 'GMT-5',
      ultimaActualizacionAnalisis:
        lastRun?.finishedAt ?? lastRun?.checkedAt ?? ciclo?.finishedAt ?? null,
      ultimoCiclo: lastRun
        ? {
            id: lastRun.id,
            trigger: lastRun.trigger ?? null,
            startedAt: lastRun.startedAt ?? null,
            finishedAt: lastRun.finishedAt ?? null,
            checkedAt: lastRun.checkedAt ?? null,
            devicesChecked: lastRun.devicesChecked ?? null,
            emailsSent: lastRun.emailsSent ?? null,
            resumen: lastRun.resumen ?? null,
            criterio: lastRun.criterio ?? null,
            skipped: lastRun.skipped ?? null,
            errors: lastRun.errors ?? [],
          }
        : null,
      telemetriaError,
    },
    resumen: {
      totalEquiposProgramados: equiposProgramados.length,
      equiposHabilitados: equiposProgramados.filter((e) => e.enabled).length,
      enRango: equiposProgramados.filter((e) => e.enRango === true).length,
      fueraRango: equiposProgramados.filter((e) => e.enRango === false).length,
      sinDatoRango: equiposProgramados.filter((e) => e.enRango == null).length,
      conEpisodioActivo: equiposProgramados.filter((e) => e.episodioActivo != null)
        .length,
      ultimasAlertasIncluidas: ultimasAlertasEnviadas.length,
    },
    equiposProgramados,
    ultimasAlertasEnviadas,
    muestrasDecision,
  };
}
