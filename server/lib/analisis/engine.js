import {
  computeOutOfRangeIntervals,
  fetchHistorialRango,
  timestampRegistroHistorial,
} from '../historicalTelemetry.js';
import { computeSinTransmisionIntervals, eventHash } from './gaps.js';
import { aggregateWeeks, monthWindow } from './weeks.js';
import {
  findAnalisisMensual,
  upsertAnalisisMensual,
  replaceEventos,
  replaceSemanas,
  listEventos,
  listSemanas,
  mapAnalisisRow,
  mapEventoRow,
  mapSemanaRow,
  getAnalisisById,
  getEvento,
  updateEventoClasificacion,
  saveInterpolatedPoints,
  listInterpolados,
} from './repository.js';
import { downsampleHourly, mergeSerieConInterpolados } from './hourly.js';
import { findAnchorRows, interpolatePliLocf } from './interpolate.js';
import { ensureAnalisisSchema } from '../db.js';
import {
  resolveRangoParaRun,
  rowEnRangoParaAnalisis,
  computeApagadoIntervalsAnalisis,
  partitionApagadoIntervals,
  intervalDurationHours,
  describeRangoSnapshot,
  MIN_APAGADO_MS,
  MIN_FUERA_RANGO_MS,
  SUMINISTRO_CERCA_SETPOINT_C,
  esEventoFalsoPositivo,
  esEventoOperativoParaMonitoreo,
} from './rango.js';
import { classifyFueraIntervalsWithDefrost } from './defrostPattern.js';

function rowKeyOf(codigo, imei) {
  return `${codigo}-${imei}`;
}

function toEventos(apagados, fuera, gaps, descartes = {}) {
  const list = [];
  const pushMany = (items, tipo, defaults = {}) => {
    for (const i of items ?? []) {
      list.push({
        tipo,
        since: i.since,
        until: i.until,
        durationHours: i.durationHours ?? intervalDurationHours(i.since, i.until),
        hash: eventHash(
          `${tipo}:${i.clasificacion ?? defaults.clasificacion ?? 'x'}`,
          i.since,
          i.until
        ),
        clasificacion: i.clasificacion ?? defaults.clasificacion,
        detalle: i.detalle ?? defaults.detalle ?? null,
      });
    }
  };

  pushMany(apagados, 'apagado');
  pushMany(fuera, 'fuera_rango');
  pushMany(gaps, 'sin_transmision');
  pushMany(descartes.falsosApagadoDuracion, 'apagado', {
    clasificacion: 'falso_apagado',
    detalle: 'Falso apagado: duración < 8 minutos (descartado del cálculo operativo).',
  });
  pushMany(descartes.falsosApagadoSuministro, 'apagado', {
    clasificacion: 'falso_apagado',
    detalle:
      'Falso apagado: power_state=0 con suministro cerca del set point (descartado del cálculo operativo).',
  });
  pushMany(descartes.fueraCortos, 'fuera_rango', {
    clasificacion: 'falso_fuera',
    detalle:
      'Fuera de rango < 30 minutos (transitorio; descartado del cálculo operativo).',
  });

  list.sort((a, b) => new Date(a.since) - new Date(b.since));
  return list;
}

function pickSetPointFromDatos(datos) {
  const sorted = [...(datos ?? [])]
    .map((row) => ({ ts: timestampRegistroHistorial(row), sp: row.set_point }))
    .filter((x) => !Number.isNaN(x.ts) && x.sp != null && !Number.isNaN(Number(x.sp)))
    .sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return null;
  return Number(sorted[sorted.length - 1].sp);
}

/**
 * Ejecuta o actualiza análisis mensual.
 * @param {{ imei: string, codigo: string, anio: number, mes: number, regenerar?: boolean, rangoAnalisis?: object }} input
 */
export async function runAnalisisMensual(input) {
  await ensureAnalisisSchema();
  const {
    imei,
    codigo,
    anio,
    mes,
    regenerar = false,
    rangoAnalisis = null,
  } = input;
  const now = new Date();
  const window = monthWindow(anio, mes, now);
  const rowKey = rowKeyOf(codigo, imei);

  let existing = await findAnalisisMensual(imei, codigo, anio, mes);
  if (regenerar && existing) {
    existing = await upsertAnalisisMensual({
      imei,
      codigo,
      rowKey,
      anio,
      mes,
      rangoConfigSnapshot: existing.rango_config_snapshot,
      analizadoDesde: null,
      analizadoHasta: null,
      estado: 'parcial',
    });
  }

  const fetchFrom =
    regenerar || existing?.analizado_hasta == null
      ? window.desde
      : new Date(new Date(existing.analizado_hasta).getTime() + 1);

  const forzarPorRango = rangoAnalisis != null;
  if (
    !regenerar &&
    !forzarPorRango &&
    fetchFrom.getTime() > window.hastaMs &&
    existing != null
  ) {
    return getAnalisisCompleto(existing.id, {
      isAdmin: input.isAdmin !== false,
    });
  }

  // Siempre mes completo para detectar intervalos/rango con coherencia.
  const hist = await fetchHistorialRango(
    codigo,
    imei,
    window.desde,
    window.hasta
  );
  const datos = hist.datos ?? [];

  const timestamps = datos
    .map((r) => timestampRegistroHistorial(r))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length === 0 && (regenerar || existing == null || forzarPorRango)) {
    throw new Error('No hay datos de telemetría en el mes seleccionado');
  }

  const setPointFallback = pickSetPointFromDatos(datos);
  const rangoInput =
    rangoAnalisis ?? existing?.rango_config_snapshot ?? null;
  const { snapshot, opts: rangoOpts } = resolveRangoParaRun(
    rowKey,
    rangoInput,
    setPointFallback
  );

  const rangoCambio =
    rangoAnalisis != null &&
    existing?.rango_config_snapshot != null &&
    JSON.stringify({
      setPoint: existing.rango_config_snapshot.setPoint,
      bandaMin: existing.rango_config_snapshot.bandaMin,
      bandaMax: existing.rango_config_snapshot.bandaMax,
    }) !==
      JSON.stringify({
        setPoint: snapshot.setPoint,
        bandaMin: snapshot.bandaMin,
        bandaMax: snapshot.bandaMax,
      });

  const fullRecompute =
    regenerar ||
    rangoCambio ||
    forzarPorRango ||
    existing?.analizado_hasta == null;

  const firstTs = timestamps[0] ?? window.desdeMs;
  const lastTs = timestamps.at(-1) ?? window.hastaMs;

  const ref = new Date(window.hastaMs);
  const {
    intervals: apagadosCandidatos,
    falsosPorSuministroPuntos,
    falsosSuministro,
  } = computeApagadoIntervalsAnalisis(datos, ref);
  const apagadosRaw = apagadosCandidatos.filter(
    (i) => new Date(i.since).getTime() >= window.desdeMs
  );
  const { reales: apagados, falsos: falsosApagado } = partitionApagadoIntervals(
    apagadosRaw,
    now.getTime()
  );
  const falsosSuministroMes = (falsosSuministro ?? []).filter(
    (i) => new Date(i.since).getTime() >= window.desdeMs
  );

  const fueraRaw = computeOutOfRangeIntervals(
    datos,
    rangoOpts,
    ref,
    rowEnRangoParaAnalisis
  ).filter((i) => new Date(i.since).getTime() >= window.desdeMs);
  const {
    defrost: fueraDefrost,
    fueraReales,
    cortos: fueraCortos,
  } = classifyFueraIntervalsWithDefrost(fueraRaw, datos, {
    minFueraMs: MIN_FUERA_RANGO_MS,
    openEnd: now.getTime(),
  });
  const fuera = [...fueraReales, ...fueraDefrost];

  const gaps = computeSinTransmisionIntervals(datos).filter(
    (i) => new Date(i.since).getTime() >= window.desdeMs
  );

  let eventos = toEventos(apagados, fuera, gaps, {
    falsosApagadoDuracion: falsosApagado,
    falsosApagadoSuministro: falsosSuministroMes,
    fueraCortos,
  });
  if (!fullRecompute && existing?.analizado_hasta != null) {
    const prevEventos = await listEventos(existing.id);
    const cutoff = new Date(existing.analizado_hasta).getTime();
    const kept = prevEventos
      .filter((e) => {
        const until =
          e.until_at == null ? cutoff : new Date(e.until_at).getTime();
        return (
          until <= cutoff &&
          new Date(e.since_at).getTime() < fetchFrom.getTime()
        );
      })
      .map((e) => ({
        tipo: e.tipo,
        since: e.since_at.toISOString?.() ?? e.since_at,
        until:
          e.until_at == null
            ? null
            : e.until_at.toISOString?.() ?? e.until_at,
        durationHours: Number(e.duration_hours),
        hash: e.hash_intervalo,
        clasificacion: e.clasificacion,
        detalle: e.detalle,
      }));
    const newOnes = eventos.filter(
      (e) => new Date(e.since).getTime() >= fetchFrom.getTime() - 60000
    );
    eventos = [...kept, ...newOnes];
    const seen = new Set();
    eventos = eventos.filter((e) => {
      if (seen.has(e.hash)) return false;
      seen.add(e.hash);
      return true;
    });
  }

  const analizadoDesde =
    fullRecompute || existing?.analizado_desde == null
      ? new Date(Math.max(firstTs, window.desdeMs))
      : existing.analizado_desde;
  const analizadoHasta = new Date(Math.max(lastTs, window.hastaMs));
  const estado =
    analizadoHasta.getTime() >= window.finMesMs ? 'cerrado_mes' : 'parcial';

  const snapshotPersist = {
    ...snapshot,
    label: describeRangoSnapshot(snapshot),
    minApagadoMinutos: MIN_APAGADO_MS / 60000,
    falsosApagadoDescartados: falsosApagado.length,
    falsosApagadoPorSuministro: falsosPorSuministroPuntos,
    suministroCercaSetpointC: SUMINISTRO_CERCA_SETPOINT_C,
    minFueraRangoMinutos: MIN_FUERA_RANGO_MS / 60000,
    fueraRangoCortosDescartados: fueraCortos.length,
    defrostAutoDetectados: fueraDefrost.length,
  };

  const cabecera = await upsertAnalisisMensual({
    imei,
    codigo,
    rowKey,
    anio,
    mes,
    rangoConfigSnapshot: snapshotPersist,
    analizadoDesde,
    analizadoHasta,
    estado,
  });

  await replaceEventos(cabecera.id, eventos, now.getTime());
  const semanas = aggregateWeeks(
    anio,
    mes,
    eventos
      .filter((e) => !esEventoFalsoPositivo(e))
      .map((e) => ({
        tipo: e.tipo,
        since: e.since,
        until: e.until,
        clasificacion: e.clasificacion,
      })),
    now.getTime()
  );
  await replaceSemanas(cabecera.id, semanas);

  const full = await getAnalisisCompleto(cabecera.id, {
    isAdmin: input.isAdmin !== false,
  });
  const isAdmin = input.isAdmin !== false;
  if (!isAdmin) return full;
  return {
    ...full,
    meta: {
      falsosApagadoDescartados: falsosApagado.length,
      falsosApagadoPorSuministro: falsosPorSuministroPuntos,
      suministroCercaSetpointC: SUMINISTRO_CERCA_SETPOINT_C,
      minApagadoMinutos: MIN_APAGADO_MS / 60000,
      fueraRangoCortosDescartados: fueraCortos.length,
      minFueraRangoMinutos: MIN_FUERA_RANGO_MS / 60000,
      defrostAutoDetectados: fueraDefrost.length,
      rangoUsado: snapshotPersist,
    },
  };
}

export async function getAnalisisCompleto(idOrKeys, { isAdmin = true } = {}) {
  await ensureAnalisisSchema();
  let row;
  if (typeof idOrKeys === 'string') {
    row = await getAnalisisById(idOrKeys);
  } else {
    row = await findAnalisisMensual(
      idOrKeys.imei,
      idOrKeys.codigo,
      idOrKeys.anio,
      idOrKeys.mes
    );
  }
  if (row == null) return null;

  const [eventos, semanas] = await Promise.all([
    listEventos(row.id),
    listSemanas(row.id),
  ]);

  const mappedAll = eventos.map((e) => mapEventoRow(e, { isAdmin }));
  const mappedEventos = isAdmin
    ? mappedAll
    : mappedAll.filter((e) => esEventoOperativoParaMonitoreo(e));

  const semanasMapped = semanas.map((s) => {
    const base = mapSemanaRow(s);
    if (isAdmin) return base;
    return {
      ...base,
      horasSinTransmision: 0,
    };
  });

  const falsos = mappedAll.filter((e) => esEventoFalsoPositivo(e));
  const horasFalsos = (pred) =>
    Math.round(
      falsos.filter(pred).reduce((s, e) => s + Number(e.durationHours || 0), 0) *
        10
    ) / 10;

  const resumen = {
    totalEventos: mappedEventos.length,
    horasFueraRango: semanas.reduce((s, w) => s + Number(w.horas_fuera_rango), 0),
    horasApagado: semanas.reduce((s, w) => s + Number(w.horas_apagado), 0),
    horasSinTransmision: isAdmin
      ? semanas.reduce((s, w) => s + Number(w.horas_sin_transmision), 0)
      : 0,
    horasDefrost: semanas.reduce((s, w) => s + Number(w.horas_defrost ?? 0), 0),
    eventosDefrost: mappedEventos.filter((e) => e.clasificacion === 'defrost')
      .length,
  };

  const analisisMapped = mapAnalisisRow(row);
  if (!isAdmin && analisisMapped.rangoConfigSnapshot != null) {
    const snap = { ...analisisMapped.rangoConfigSnapshot };
    delete snap.falsosApagadoDescartados;
    delete snap.falsosApagadoPorSuministro;
    delete snap.fueraRangoCortosDescartados;
    delete snap.defrostAutoDetectados;
    delete snap.suministroCercaSetpointC;
    delete snap.minApagadoMinutos;
    delete snap.minFueraRangoMinutos;
    analisisMapped.rangoConfigSnapshot = snap;
  }

  return {
    analisis: analisisMapped,
    eventos: mappedEventos,
    semanas: semanasMapped,
    resumen: {
      ...resumen,
      horasFueraRango: Math.round(resumen.horasFueraRango * 10) / 10,
      horasApagado: Math.round(resumen.horasApagado * 10) / 10,
      horasSinTransmision: Math.round(resumen.horasSinTransmision * 10) / 10,
      horasDefrost: Math.round(resumen.horasDefrost * 10) / 10,
      ...(isAdmin
        ? {
            eventosFalsoApagado: falsos.filter(
              (e) => e.clasificacion === 'falso_apagado'
            ).length,
            horasFalsoApagado: horasFalsos(
              (e) => e.clasificacion === 'falso_apagado'
            ),
            eventosFalsoFuera: falsos.filter(
              (e) => e.clasificacion === 'falso_fuera'
            ).length,
            horasFalsoFuera: horasFalsos(
              (e) => e.clasificacion === 'falso_fuera'
            ),
          }
        : {}),
    },
  };
}

export async function patchEventoClasificacion(eventoId, body) {
  await ensureAnalisisSchema();
  const allowed = [
    'autorizado',
    'programado',
    'no_previsto',
    'sin_clasificar',
    'defrost',
    'falso_apagado',
    'falso_fuera',
  ];
  if (!allowed.includes(body.clasificacion)) {
    throw new Error('Clasificación inválida');
  }
  const row = await updateEventoClasificacion(eventoId, {
    clasificacion: body.clasificacion,
    detalle: body.detalle,
    autor: body.autor,
  });
  if (row == null) throw new Error('Evento no encontrado');
  return mapEventoRow(row, { isAdmin: true });
}

export async function getEventoSerie(eventoId) {
  await ensureAnalisisSchema();
  const evento = await getEvento(eventoId);
  if (evento == null) throw new Error('Evento no encontrado');
  const analisis = await getAnalisisById(evento.analisis_id);
  if (analisis == null) throw new Error('Análisis no encontrado');

  const since = evento.since_at;
  const until = evento.until_at ?? analisis.analizado_hasta ?? new Date();
  const hist = await fetchHistorialRango(
    analisis.codigo,
    analisis.imei,
    new Date(since),
    new Date(until)
  );
  const oficial = downsampleHourly(hist.datos ?? [], since, until);
  const interpolados = await listInterpolados(
    analisis.id,
    new Date(since).toISOString(),
    new Date(until).toISOString()
  );
  const serie = mergeSerieConInterpolados(
    oficial,
    interpolados.map((p) => ({
      ts: p.ts.toISOString?.() ?? p.ts,
      payload: p.payload,
    }))
  );

  return {
    evento: mapEventoRow(evento, { isAdmin: true }),
    serie,
  };
}

export async function interpolarHueco(eventoId, { autor }) {
  await ensureAnalisisSchema();
  const evento = await getEvento(eventoId);
  if (evento == null) throw new Error('Evento no encontrado');
  if (evento.tipo !== 'sin_transmision') {
    throw new Error('Solo se interpolan eventos sin transmisión');
  }
  const analisis = await getAnalisisById(evento.analisis_id);
  if (analisis == null) throw new Error('Análisis no encontrado');

  const hist = await fetchHistorialRango(
    analisis.codigo,
    analisis.imei,
    new Date(analisis.analizado_desde ?? evento.since_at),
    new Date(analisis.analizado_hasta ?? evento.until_at)
  );
  const { before, after } = findAnchorRows(
    hist.datos ?? [],
    evento.since_at,
    evento.until_at
  );
  if (before == null || after == null) {
    throw new Error('No hay anclas antes/después del hueco para interpolar');
  }
  const points = interpolatePliLocf(before, after);
  const saved = await saveInterpolatedPoints(
    analisis.id,
    evento.id,
    points,
    autor
  );
  return {
    count: saved.length,
    points: saved.map((p) => ({
      ts: p.ts,
      payload: p.payload,
      metodo: p.metodo,
    })),
  };
}
