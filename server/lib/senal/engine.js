import { buildEpisodesFromSamples, monthRangeUtc } from './behavior.js';
import {
  getSenalCursor,
  setSenalCursor,
  getDeviceStates,
  upsertDeviceState,
  insertEpisodio,
  applyEpisodeToResumenSimplified,
  bumpResumenSample,
  getMesMeta,
  upsertMesMeta,
  countSamplesInMonth,
  fetchSamplesAfter,
  fetchSamplesInMonth,
  getResumenMes,
  listEpisodiosMes,
  listEpisodiosImei,
  listEventosImei,
  bumpLastDisconnect,
  updateEpisodioDatos,
  resetSenalComputed,
  listKnownDevices,
  getSenalJob,
  EMPTY_HOURS,
} from './repository.js';
import { listSenalUbicaciones, getSenalUbicacion } from './ubicacionRepository.js';
import { pickTelemetryFromSample, pickTelemetryFromHistorialRow } from './telemetry.js';
import { getDeviceNameByImei } from '../deviceNamesRepository.js';
import {
  classifySenalTipo,
  mergeAndClassifyLazos,
  countLazosByTipo,
} from './classify.js';

const TZ = 'America/Lima';

function hourInTz(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return h === 24 ? 0 : h;
}

function anioMesInTz(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  return { anio: y, mes: m };
}

function addIntervalToHourBuckets(a, b, buckets) {
  let t = a.getTime();
  const end = b.getTime();
  if (!(end > t)) return;
  while (t < end) {
    const cur = new Date(t);
    const h = hourInTz(cur);
    const stepEnd = Math.min(t + 60_000, end);
    buckets[h] += (stepEnd - t) / 60_000;
    t = stepEnd;
  }
}

function mapEpisodio(e) {
  return {
    id: e.id ?? null,
    tipo: e.tipo,
    startedAt: new Date(e.started_at).toISOString(),
    endedAt: new Date(e.ended_at).toISOString(),
    durationMin: e.duration_min,
    recovered: e.recovered,
    startHour: e.start_hour,
    endHour: e.end_hour,
    datosInicio: e.datos_inicio ?? null,
    datosFin: e.datos_fin ?? null,
  };
}

function lastDisconnectFromEpisodes(eps, fallback) {
  let latest = fallback ? new Date(fallback).getTime() : 0;
  for (const e of eps) {
    const t = Date.parse(e.startedAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest ? new Date(latest).toISOString() : null;
}

function monthFullyPast(anio, mes) {
  const { toIso } = monthRangeUtc(anio, mes);
  const endMs = Date.parse(`${toIso}-05:00`);
  if (Number.isNaN(endMs)) {
    const endMs2 = Date.parse(
      toIso.replace('T00:00:00', 'T00:00:00-05:00')
    );
    return Date.now() >= endMs2;
  }
  return Date.now() >= endMs;
}

/**
 * Cierra episodio abierto y lo materializa en DB (una sola vez).
 */
async function closeOpen(state, endAt, recovered, datosFin = null) {
  if (!state.open_tipo || !state.open_started_at) return;
  const started = new Date(state.open_started_at);
  const ended = new Date(endAt);
  const durationMin = Math.max(
    0,
    Math.round((ended.getTime() - started.getTime()) / 60_000)
  );
  const tipo = classifySenalTipo(durationMin);
  if (!tipo) {
    state.open_tipo = null;
    state.open_started_at = null;
    state.open_datos_inicio = null;
    return;
  }
  const { anio, mes } = anioMesInTz(started);
  const hourlyWait = EMPTY_HOURS();
  const hourlyOffline = EMPTY_HOURS();
  const buckets = tipo === 'wait' ? hourlyWait : hourlyOffline;
  addIntervalToHourBuckets(started, ended, buckets);

  const ep = {
    imei: state.imei,
    codigo: state.codigo,
    tipo,
    started_at: started,
    ended_at: ended,
    duration_min: durationMin,
    recovered: Boolean(recovered),
    start_hour: hourInTz(started),
    end_hour: hourInTz(ended),
    anio,
    mes,
    datos_inicio: state.open_datos_inicio ?? state.last_telemetry ?? null,
    datos_fin: datosFin ?? null,
  };
  await insertEpisodio(ep);
  await applyEpisodeToResumenSimplified(
    ep,
    hourlyWait.map((x) => Math.round(x)),
    hourlyOffline.map((x) => Math.round(x))
  );
  state.open_tipo = null;
  state.open_started_at = null;
  state.open_datos_inicio = null;
}

/**
 * Procesa una secuencia de samples (ordenados por tiempo) de forma incremental.
 * @returns {{ processed: number, lastAt: Date|null }}
 */
export async function processSampleBatch(samples) {
  if (!samples.length) return { processed: 0, lastAt: null };

  const imeis = [...new Set(samples.map((s) => String(s.imei)))];
  const states = await getDeviceStates(imeis);
  let lastAt = null;

  for (const s of samples) {
    const imei = String(s.imei);
    const at = new Date(s.captured_at);
    lastAt = at;
    const estado = String(s.estado_conexion ?? '').toLowerCase();
    const codigo = s.codigo ? String(s.codigo) : null;
    const rowKey = s.row_key ? String(s.row_key) : imei;
    const { anio, mes } = anioMesInTz(at);

    let st = states.get(imei);
    if (!st) {
      st = {
        imei,
        codigo,
        row_key: rowKey,
        last_estado: null,
        last_captured_at: null,
        open_tipo: null,
        open_started_at: null,
        last_telemetry: null,
        open_datos_inicio: null,
      };
      states.set(imei, st);
    }

    st.codigo = codigo ?? st.codigo;
    st.row_key = rowKey;
    const telemetry = pickTelemetryFromSample(s);

    await bumpResumenSample(imei, anio, mes, codigo, estado, at);

    const disconnected = estado === 'wait' || estado === 'offline';
    if (disconnected) {
      if (!st.open_tipo) {
        st.open_tipo = 'wait';
        st.open_started_at = at;
        st.open_datos_inicio = st.last_telemetry ?? telemetry ?? null;
      }
    } else if (estado === 'online') {
      if (st.open_tipo) {
        await closeOpen(st, at, true, telemetry);
      }
    }

    if (telemetry) st.last_telemetry = telemetry;
    st.last_estado = estado;
    st.last_captured_at = at;
  }

  // Persist device states touched
  for (const st of states.values()) {
    await upsertDeviceState(st);
  }

  return {
    processed: samples.length,
    lastAt,
    lastImei: samples.length ? String(samples[samples.length - 1].imei) : null,
  };
}

/**
 * Consume samples nuevos desde el cursor (puede correr en background).
 */
export async function processSenalIncremental({ maxBatches = 20, batchSize = 4000 } = {}) {
  let total = 0;
  let cursor = await getSenalCursor();
  let lastImei = null;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await fetchSamplesAfter(cursor, batchSize);
    if (!batch.length) break;
    const { processed, lastAt, lastImei: batchImei } = await processSampleBatch(batch);
    total += processed;
    if (batchImei) lastImei = batchImei;
    if (lastAt) {
      cursor = lastAt;
      await setSenalCursor(lastAt);
    }
    if (batch.length < batchSize) break;
  }

  // Cerrar meses pasados si el cursor ya los superó
  await finalizePastMonths(cursor);

  return { processed: total, cursor, lastImei };
}

/**
 * Reanaliza toda la flota desde el primer sample. Solo superusuario.
 */
export async function reprocessSenalFromScratch() {
  await resetSenalComputed();
  let total = 0;
  let last = { processed: 0, cursor: null };
  for (let i = 0; i < 80; i++) {
    last = await processSenalIncremental({ maxBatches: 8, batchSize: 4000 });
    total += last.processed;
    if (!last.processed) break;
  }
  return { processed: total, cursor: last.cursor, mode: 'from_scratch' };
}

async function finalizePastMonths(cursor) {
  if (!cursor) return;
  const now = new Date();
  // Mark last 6 months if past and processed
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const anio = d.getFullYear();
    const mes = d.getMonth() + 1;
    const { toIso } = monthRangeUtc(anio, mes);
    const endMs = Date.parse(`${toIso.replace('T00:00:00', '')}T00:00:00-05:00`);
    if (cursor.getTime() >= endMs) {
      const meta = await getMesMeta(anio, mes);
      if (meta?.processed_once && !meta.finalized) {
        await upsertMesMeta(anio, mes, { processed_once: true, finalized: true });
      }
    }
  }
}

/**
 * Backfill de un mes ya "pasado" por el cursor pero nunca materializado.
 * No mueve el cursor ni el estado abierto actual: escribe episodios/resumen una vez.
 */
async function backfillMonthIsolated(samples, anio, mes) {
  const { query } = await import('../db.js');
  const built = buildEpisodesFromSamples(samples);

  for (const d of built.devices) {
    for (const e of d.episodes) {
      if (e.open) continue;
      const started = new Date(e.startedAt);
      const ended = new Date(e.endedAt);
      const { anio: ea, mes: em } = anioMesInTz(started);
      if (ea !== anio || em !== mes) continue;

      const hourlyWait = EMPTY_HOURS();
      const hourlyOffline = EMPTY_HOURS();
      const buckets = e.tipo === 'wait' ? hourlyWait : hourlyOffline;
      addIntervalToHourBuckets(started, ended, buckets);

      const ep = {
        imei: d.imei,
        codigo: d.codigo,
        tipo: e.tipo,
        started_at: started,
        ended_at: ended,
        duration_min: e.durationMin,
        recovered: e.recovered,
        start_hour: e.startHour,
        end_hour: e.endHour,
        anio,
        mes,
        datos_inicio: e.datosInicio ?? null,
        datos_fin: e.datosFin ?? null,
      };
      await insertEpisodio(ep);
      await applyEpisodeToResumenSimplified(
        ep,
        hourlyWait.map((x) => Math.round(x)),
        hourlyOffline.map((x) => Math.round(x))
      );
    }

    await query(
      `INSERT INTO senal_resumen_mes (
         imei, anio, mes, codigo, samples_seen, last_estado, last_captured_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (imei, anio, mes) DO UPDATE SET
         codigo = COALESCE(EXCLUDED.codigo, senal_resumen_mes.codigo),
         samples_seen = EXCLUDED.samples_seen,
         last_estado = EXCLUDED.last_estado,
         last_captured_at = EXCLUDED.last_captured_at,
         updated_at = now()`,
      [
        d.imei,
        anio,
        mes,
        d.codigo,
        d.samples,
        d.lastEstado,
        d.lastCapturedAt,
      ]
    );
  }
}

/**
 * Garantiza que un mes histórico se procesó una sola vez desde samples.
 * Meses finalizados no vuelven a escanear dashboard_device_sample.
 */
export async function ensureMonthMaterialized(anio, mes) {
  const meta = await getMesMeta(anio, mes);
  if (meta?.finalized) {
    return { status: 'cached_final', meta };
  }

  // Siempre drenar muestras nuevas (barato si el cursor está al día)
  await processSenalIncremental({ maxBatches: 5 });

  const updatedMeta = await getMesMeta(anio, mes);
  if (updatedMeta?.finalized) {
    return { status: 'cached_final', meta: updatedMeta };
  }

  // Si el mes ya fue procesado una vez y es el mes actual → solo incremental
  const now = new Date();
  const isCurrent =
    anio === now.getFullYear() && mes === now.getMonth() + 1;

  if (updatedMeta?.processed_once && isCurrent) {
    await upsertMesMeta(anio, mes, { processed_once: true });
    return { status: 'incremental', meta: updatedMeta };
  }

  if (updatedMeta?.processed_once && !isCurrent && monthFullyPast(anio, mes)) {
    const resumen = await getResumenMes(anio, mes);
    if (resumen.length > 0) {
      await upsertMesMeta(anio, mes, {
        processed_once: true,
        finalized: true,
        device_count: resumen.length,
      });
      return { status: 'cached_final', meta: await getMesMeta(anio, mes) };
    }
  }

  // Primera vez para este mes
  if (!updatedMeta?.processed_once) {
    const range = monthRangeUtc(anio, mes);
    const counts = await countSamplesInMonth(range.fromIso, range.toIso);
    const samples = await fetchSamplesInMonth(range.fromIso, range.toIso);
    const cursor = await getSenalCursor();
    const resumenExisting = await getResumenMes(anio, mes);

    const toProcess = cursor
      ? samples.filter((s) => new Date(s.captured_at) > cursor)
      : samples;

    if (resumenExisting.length > 0 && toProcess.length === 0) {
      await upsertMesMeta(anio, mes, {
        processed_once: true,
        finalized: monthFullyPast(anio, mes),
        sample_count: counts.sample_count,
        device_count: counts.device_count || resumenExisting.length,
      });
      return { status: 'already_in_cursor', meta: await getMesMeta(anio, mes) };
    }

    if (
      toProcess.length === 0 &&
      samples.length > 0 &&
      cursor &&
      resumenExisting.length === 0
    ) {
      // Cursor ya pasó el mes sin materializarlo → backfill aislado (una vez)
      await backfillMonthIsolated(samples, anio, mes);
      await upsertMesMeta(anio, mes, {
        processed_once: true,
        finalized: monthFullyPast(anio, mes),
        sample_count: counts.sample_count,
        device_count: counts.device_count,
      });
      return { status: 'backfilled_once', meta: await getMesMeta(anio, mes) };
    }

    if (!cursor && samples.length) {
      const { lastAt } = await processSampleBatch(samples);
      if (lastAt) await setSenalCursor(lastAt);
    } else if (toProcess.length) {
      const { lastAt } = await processSampleBatch(toProcess);
      if (lastAt) {
        const cur = await getSenalCursor();
        if (!cur || lastAt > cur) await setSenalCursor(lastAt);
      }
    }

    await upsertMesMeta(anio, mes, {
      processed_once: true,
      finalized: monthFullyPast(anio, mes),
      sample_count: counts.sample_count,
      device_count: counts.device_count,
    });

    return { status: 'materialized_once', meta: await getMesMeta(anio, mes) };
  }

  return { status: 'ok', meta: updatedMeta };
}

function mapUbicacionRow(imei, ubi, r = null) {
  if (ubi) {
    return {
      imei: ubi.imei,
      codigo: ubi.codigo,
      pais: ubi.pais,
      departamento: ubi.departamento,
      provincia: ubi.provincia,
      distrito: ubi.distrito,
      zona: ubi.zona,
      observaciones: ubi.observaciones,
      latitud: ubi.latitud,
      longitud: ubi.longitud,
    };
  }
  if (r && (r.pais || r.departamento || r.zona)) {
    return {
      imei,
      pais: r.pais,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      zona: r.zona,
      observaciones: r.observaciones,
      latitud: r.latitud,
      longitud: r.longitud,
    };
  }
  return null;
}

function avgMin(total, n) {
  const count = Number(n) || 0;
  if (count <= 0) return 0;
  return Math.round((Number(total) || 0) / count);
}

function openDisconnect(st, anio, mes) {
  if (!st?.open_tipo || !st.open_started_at) return null;
  const started = new Date(st.open_started_at);
  const { anio: oa, mes: om } = anioMesInTz(started);
  if (oa !== anio || om !== mes) return null;
  const endAt = st.last_captured_at ? new Date(st.last_captured_at) : new Date();
  const durationMin = Math.max(
    0,
    Math.round((endAt.getTime() - started.getTime()) / 60_000)
  );
  const tipo = classifySenalTipo(durationMin);
  if (!tipo) return null;
  return { tipo, startedAt: started.toISOString() };
}

/**
 * Listado de flota desde resumen + equipos inscritos. No lee episodios ni reprocesa samples.
 */
async function buildFleetCacheReport(anio, mes, range, catchUp) {
  const [resumenRows, known, ubicaciones] = await Promise.all([
    getResumenMes(anio, mes, null),
    listKnownDevices().catch(() => []),
    listSenalUbicaciones(),
  ]);
  const ubiByImei = new Map(ubicaciones.map((u) => [u.imei, u]));
  const imeis = [
    ...new Set([
      ...resumenRows.map((r) => r.imei),
      ...known.map((k) => k.imei).filter(Boolean),
    ]),
  ];
  const states = imeis.length ? await getDeviceStates(imeis) : new Map();

  const hourlyWaitMin = EMPTY_HOURS();
  const hourlyOfflineMin = EMPTY_HOURS();
  const devices = [];
  const seen = new Set();

  for (const r of resumenRows) {
    seen.add(r.imei);
    const st = states.get(r.imei);
    const waitEpisodes = Number(r.wait_episodes) || 0;
    const offlineEpisodes = Number(r.offline_episodes) || 0;
    const waitTotalMin = Number(r.wait_total_min) || 0;
    const offlineTotalMin = Number(r.offline_total_min) || 0;
    const hw = r.hourly_wait_min || EMPTY_HOURS();
    const ho = r.hourly_offline_min || EMPTY_HOURS();
    for (let i = 0; i < 24; i++) {
      hourlyWaitMin[i] += Math.round(Number(hw[i]) || 0);
      hourlyOfflineMin[i] += Math.round(Number(ho[i]) || 0);
    }
    const open = openDisconnect(st, anio, mes);
    let lastDisconnectAt = r.last_disconnect_at
      ? new Date(r.last_disconnect_at).toISOString()
      : null;
    if (open && (!lastDisconnectAt || open.startedAt > lastDisconnectAt)) {
      lastDisconnectAt = open.startedAt;
    }
    devices.push({
      imei: r.imei,
      codigo: r.codigo,
      nombre: r.nombre || getDeviceNameByImei(r.imei) || null,
      lastDisconnectAt,
      rowKey: st?.row_key ?? r.imei,
      samples: r.samples_seen,
      lastEstado: r.last_estado ?? st?.last_estado ?? '',
      lastCapturedAt: r.last_captured_at
        ? new Date(r.last_captured_at).toISOString()
        : null,
      waitEpisodes,
      waitRecovered: Number(r.wait_recovered) || 0,
      waitAvgMin: avgMin(waitTotalMin, waitEpisodes),
      waitTotalMin,
      offlineEpisodes,
      offlineRecovered: Number(r.offline_recovered) || 0,
      offlineAvgMin: avgMin(offlineTotalMin, offlineEpisodes),
      offlineTotalMin,
      episodes: [],
      neverDisconnected: waitEpisodes === 0 && offlineEpisodes === 0 && !open,
      ubicacion: mapUbicacionRow(r.imei, ubiByImei.get(r.imei), r),
    });
  }

  for (const k of known) {
    if (!k.imei || seen.has(k.imei)) continue;
    seen.add(k.imei);
    const st = states.get(k.imei);
    const open = openDisconnect(st, anio, mes);
    devices.push({
      imei: k.imei,
      codigo: k.codigo ?? null,
      nombre: getDeviceNameByImei(k.imei) || null,
      lastDisconnectAt: open ? open.startedAt : null,
      rowKey: k.row_key ?? k.imei,
      samples: 0,
      lastEstado: k.last_estado_conexion ?? st?.last_estado ?? 'online',
      lastCapturedAt: k.last_seen_at
        ? new Date(k.last_seen_at).toISOString()
        : null,
      waitEpisodes: 0,
      waitRecovered: 0,
      waitAvgMin: 0,
      waitTotalMin: 0,
      offlineEpisodes: 0,
      offlineRecovered: 0,
      offlineAvgMin: 0,
      offlineTotalMin: 0,
      episodes: [],
      neverDisconnected: !open,
      ubicacion: mapUbicacionRow(k.imei, ubiByImei.get(k.imei)),
    });
  }

  devices.sort((a, b) => {
    const ta = Date.parse(a.lastDisconnectAt || '') || 0;
    const tb = Date.parse(b.lastDisconnectAt || '') || 0;
    return tb - ta;
  });

  const meta = await getMesMeta(anio, mes);
  const stillBad = devices.filter((d) => !d.neverDisconnected && (
    (d.lastEstado || '').toLowerCase().includes('wait')
    || (d.lastEstado || '').toLowerCase().includes('offline')
    || Boolean(openDisconnect(states.get(d.imei), anio, mes))
  )).length;

  return {
    anio,
    mes,
    from: range.fromIso,
    to: range.toIso,
    timezone: TZ,
    sampleCount: meta?.sample_count ?? devices.reduce((s, d) => s + (Number(d.samples) || 0), 0),
    deviceCount: devices.length,
    source: 'persisted',
    ensureStatus: catchUp.mode,
    lastProcessedAt: catchUp.cursor
      ? new Date(catchUp.cursor).toISOString()
      : null,
    processedNew: 0,
    finalized: Boolean(meta?.finalized),
    processedOnce: Boolean(meta?.processed_once),
    summary: {
      devicesWithWait: devices.filter((d) => d.waitEpisodes > 0).length,
      devicesWithOffline: devices.filter((d) => d.offlineEpisodes > 0).length,
      devicesStillWaitOrOffline: stillBad,
      peakWaitHour: hourlyWaitMin.indexOf(Math.max(...hourlyWaitMin, 0)),
      peakOfflineHour: hourlyOfflineMin.indexOf(Math.max(...hourlyOfflineMin, 0)),
      totalWaitMin: devices.reduce((s, d) => s + d.waitTotalMin, 0),
      totalOfflineMin: devices.reduce((s, d) => s + d.offlineTotalMin, 0),
    },
    hourlyWaitMin,
    hourlyOfflineMin,
    devices,
  };
}

/**
 * Reporte desde datos persistidos. El listado no reprocesa samples ni episodios.
 */
export async function getPersistedMonthReport(anio, mes, imei = null) {
  const catchUp = { processed: 0, cursor: await getSenalCursor(), mode: 'cache' };
  const range = monthRangeUtc(anio, mes);
  if (!imei) {
    return buildFleetCacheReport(anio, mes, range, catchUp);
  }

  const resumenRows = await getResumenMes(anio, mes, imei);
  const episodios = await listEpisodiosMes(anio, mes, imei);
  const states = await getDeviceStates(
    imei ? [String(imei)] : resumenRows.map((r) => r.imei)
  );
  const ubicaciones = await listSenalUbicaciones();
  const ubiByImei = new Map(ubicaciones.map((u) => [u.imei, u]));

  const episodiosByImei = new Map();
  for (const e of episodios) {
    if (!episodiosByImei.has(e.imei)) episodiosByImei.set(e.imei, []);
    episodiosByImei.get(e.imei).push(e);
  }

  const devices = resumenRows.map((r) => {
    const st = states.get(r.imei);
    const rawEps = (episodiosByImei.get(r.imei) ?? []).map((e) => mapEpisodio(e));
    if (st?.open_tipo && st.open_started_at) {
      const started = new Date(st.open_started_at);
      const { anio: oa, mes: om } = anioMesInTz(started);
      if (oa === anio && om === mes) {
        const endAt = st.last_captured_at
          ? new Date(st.last_captured_at)
          : new Date();
        rawEps.unshift({
          id: null,
          tipo: st.open_tipo,
          startedAt: started.toISOString(),
          endedAt: endAt.toISOString(),
          durationMin: Math.max(
            0,
            Math.round((endAt.getTime() - started.getTime()) / 60_000)
          ),
          recovered: false,
          open: true,
          startHour: hourInTz(started),
          endHour: hourInTz(endAt),
          datosInicio: st.open_datos_inicio ?? st.last_telemetry ?? null,
          datosFin: null,
        });
      }
    }
    const eps = mergeAndClassifyLazos(rawEps);
    const counts = countLazosByTipo(eps);

    const ubi = ubiByImei.get(r.imei) ?? null;
    const lastDisconnectAt = lastDisconnectFromEpisodes(eps, null);
    return {
      imei: r.imei,
      codigo: r.codigo,
      nombre: r.nombre || getDeviceNameByImei(r.imei) || null,
      lastDisconnectAt,
      rowKey: st?.row_key ?? r.imei,
      samples: r.samples_seen,
      lastEstado: r.last_estado ?? st?.last_estado ?? '',
      lastCapturedAt: r.last_captured_at
        ? new Date(r.last_captured_at).toISOString()
        : null,
      waitEpisodes: counts.waitEpisodes,
      waitRecovered: counts.waitRecovered,
      waitAvgMin: counts.waitAvgMin,
      waitTotalMin: counts.waitTotalMin,
      offlineEpisodes: counts.offlineEpisodes,
      offlineRecovered: counts.offlineRecovered,
      offlineAvgMin: counts.offlineAvgMin,
      offlineTotalMin: counts.offlineTotalMin,
      episodes: eps,
      ubicacion: mapUbicacionRow(r.imei, ubi, r),
      neverDisconnected: counts.waitEpisodes === 0 && counts.offlineEpisodes === 0,
    };
  });

  if (!imei) {
    const known = await listKnownDevices().catch(() => []);
    const seen = new Set(devices.map((d) => d.imei));
    for (const k of known) {
      if (!k.imei || seen.has(k.imei)) continue;
      seen.add(k.imei);
      const ubi = ubiByImei.get(k.imei) ?? null;
      devices.push({
        imei: k.imei,
        codigo: k.codigo ?? null,
        nombre: getDeviceNameByImei(k.imei) || null,
        lastDisconnectAt: null,
        rowKey: k.row_key ?? k.imei,
        samples: 0,
        lastEstado: k.last_estado_conexion ?? 'online',
        lastCapturedAt: k.last_seen_at
          ? new Date(k.last_seen_at).toISOString()
          : null,
        waitEpisodes: 0,
        waitRecovered: 0,
        waitAvgMin: 0,
        waitTotalMin: 0,
        offlineEpisodes: 0,
        offlineRecovered: 0,
        offlineAvgMin: 0,
        offlineTotalMin: 0,
        episodes: [],
        neverDisconnected: true,
        ubicacion: mapUbicacionRow(k.imei, ubi),
      });
    }
  }

  devices.sort((a, b) => {
    const ta = Date.parse(a.lastDisconnectAt || '') || 0;
    const tb = Date.parse(b.lastDisconnectAt || '') || 0;
    return tb - ta;
  });

  const hourlyWaitMin = EMPTY_HOURS();
  const hourlyOfflineMin = EMPTY_HOURS();
  for (const d of devices) {
    for (const e of d.episodes) {
      const buckets = e.tipo === 'wait' ? hourlyWaitMin : hourlyOfflineMin;
      addIntervalToHourBuckets(new Date(e.startedAt), new Date(e.endedAt), buckets);
    }
  }

  const withWait = devices.filter((d) => d.waitEpisodes > 0).length;
  const withOffline = devices.filter((d) => d.offlineEpisodes > 0).length;
  const stillBad = devices.filter((d) => d.episodes.some((e) => e.open)).length;
  const peakWaitHour = hourlyWaitMin.indexOf(Math.max(...hourlyWaitMin, 0));
  const peakOfflineHour = hourlyOfflineMin.indexOf(
    Math.max(...hourlyOfflineMin, 0)
  );

  const meta = await getMesMeta(anio, mes);

  return {
    anio,
    mes,
    from: range.fromIso,
    to: range.toIso,
    timezone: TZ,
    sampleCount: meta?.sample_count ?? devices.reduce((s, d) => s + d.samples, 0),
    deviceCount: devices.length,
    source: 'persisted',
    ensureStatus: catchUp.mode || 'cache',
    lastProcessedAt: catchUp.cursor
      ? new Date(catchUp.cursor).toISOString()
      : null,
    processedNew: catchUp.processed ?? 0,
    finalized: Boolean(meta?.finalized),
    processedOnce: Boolean(meta?.processed_once),
    summary: {
      devicesWithWait: withWait,
      devicesWithOffline: withOffline,
      devicesStillWaitOrOffline: stillBad,
      peakWaitHour,
      peakOfflineHour,
      totalWaitMin: devices.reduce((s, d) => s + d.waitTotalMin, 0),
      totalOfflineMin: devices.reduce((s, d) => s + d.offlineTotalMin, 0),
    },
    hourlyWaitMin,
    hourlyOfflineMin,
    devices,
  };
}

function mapEvento(e) {
  return {
    id: e.id,
    imei: e.imei,
    episodioId: e.episodio_id ?? null,
    tipo: e.tipo,
    titulo: e.titulo ?? null,
    nota: e.nota ?? null,
    occurredAt: e.occurred_at ? new Date(e.occurred_at).toISOString() : null,
    createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
    createdBy: e.created_by ?? null,
  };
}

function nearestHistorial(rows, targetMs, mode) {
  let best = null;
  let bestDelta = Infinity;
  for (const row of rows) {
    const ts = Date.parse(row.created_at ?? row.fecha ?? '');
    if (!Number.isFinite(ts)) continue;
    if (mode === 'before' && ts > targetMs + 60_000) continue;
    if (mode === 'after' && ts < targetMs - 60_000) continue;
    const delta = Math.abs(ts - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = row;
    }
  }
  return best;
}

async function enrichEpisodesFromHistorial(imei, codigo, episodes) {
  const missing = episodes.filter(
    (e) => e.id && (!e.datosInicio || (e.recovered && !e.datosFin))
  );
  if (!missing.length || !codigo) return episodes;

  let fetchHistorialRango;
  try {
    ({ fetchHistorialRango } = await import('../historicalTelemetry.js'));
  } catch {
    return episodes;
  }

  const starts = missing.map((e) => Date.parse(e.startedAt)).filter(Number.isFinite);
  const ends = missing.map((e) => Date.parse(e.endedAt)).filter(Number.isFinite);
  if (!starts.length) return episodes;

  const fromMs = Math.min(...starts) - 2 * 60 * 60 * 1000;
  const toMs = Math.max(...ends, Date.now()) + 2 * 60 * 60 * 1000;
  const span = toMs - fromMs;
  const cappedFrom = span > 14 * 24 * 60 * 60 * 1000 ? toMs - 14 * 24 * 60 * 60 * 1000 : fromMs;

  let datos = [];
  try {
    const hist = await fetchHistorialRango(
      codigo,
      imei,
      new Date(cappedFrom),
      new Date(toMs)
    );
    datos = Array.isArray(hist?.datos) ? hist.datos : [];
  } catch (e) {
    console.warn('[senal] historial', imei, e.message);
    return episodes;
  }
  if (!datos.length) return episodes;

  for (const e of missing) {
    const startMs = Date.parse(e.startedAt);
    const endMs = Date.parse(e.endedAt);
    const inicio = e.datosInicio
      ? null
      : pickTelemetryFromHistorialRow(nearestHistorial(datos, startMs, 'before'));
    const fin =
      e.datosFin || !e.recovered
        ? null
        : pickTelemetryFromHistorialRow(nearestHistorial(datos, endMs, 'after'));
    if (inicio) e.datosInicio = inicio;
    if (fin) e.datosFin = fin;
    if (e.id && (inicio || fin)) {
      await updateEpisodioDatos(e.id, inicio, fin).catch(() => {});
    }
  }
  return episodes;
}

/**
 * Historial persistente de un IMEI (todos los meses) + eventos y ubicación.
 */
export async function getDeviceSenalHistory(imei) {
  const key = String(imei ?? '').trim();
  if (!key) throw new Error('IMEI obligatorio');

  const [rows, eventos, ubi, states] = await Promise.all([
    listEpisodiosImei(key, 250),
    listEventosImei(key, 250),
    getSenalUbicacion(key),
    getDeviceStates([key]),
  ]);

  const st = states.get(key);
  let episodes = rows.map(mapEpisodio);
  if (st?.open_tipo && st.open_started_at) {
    const started = new Date(st.open_started_at);
    const endAt = st.last_captured_at ? new Date(st.last_captured_at) : new Date();
    episodes.unshift({
      id: null,
      tipo: st.open_tipo,
      startedAt: started.toISOString(),
      endedAt: endAt.toISOString(),
      durationMin: Math.max(
        0,
        Math.round((endAt.getTime() - started.getTime()) / 60_000)
      ),
      recovered: false,
      open: true,
      startHour: hourInTz(started),
      endHour: hourInTz(endAt),
      datosInicio: st.open_datos_inicio ?? st.last_telemetry ?? null,
      datosFin: null,
    });
  }

  const codigo = st?.codigo ?? rows[0]?.codigo ?? null;
  episodes = mergeAndClassifyLazos(episodes);

  return {
    imei: key,
    codigo,
    nombre: getDeviceNameByImei(key) || null,
    lastEstado: st?.last_estado ?? null,
    lastCapturedAt: st?.last_captured_at
      ? new Date(st.last_captured_at).toISOString()
      : null,
    lastDisconnectAt: lastDisconnectFromEpisodes(episodes, null),
    ubicacion: ubi,
    episodes,
    eventos: eventos.map(mapEvento),
  };
}

/** Solo avanza si el job está en marcha. Idle/pausa/done no tocan samples. */
export async function processSenalIncrementalSafe() {
  try {
    const job = await getSenalJob().catch(() => null);
    if (job?.status !== 'running') {
      return { processed: 0, skipped: job?.status || 'idle' };
    }
    const r = await processSenalIncremental({ maxBatches: 4, batchSize: 800 });
    return r;
  } catch (e) {
    console.warn('[senal] incremental:', e.message);
    return { processed: 0, error: e.message };
  }
}
