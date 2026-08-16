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
  EMPTY_HOURS,
} from './repository.js';
import { listSenalUbicaciones } from './ubicacionRepository.js';

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
async function closeOpen(state, endAt, recovered) {
  if (!state.open_tipo || !state.open_started_at) return;
  const started = new Date(state.open_started_at);
  const ended = new Date(endAt);
  const durationMin = Math.max(
    0,
    Math.round((ended.getTime() - started.getTime()) / 60_000)
  );
  const { anio, mes } = anioMesInTz(started);
  const hourlyWait = EMPTY_HOURS();
  const hourlyOffline = EMPTY_HOURS();
  const buckets = state.open_tipo === 'wait' ? hourlyWait : hourlyOffline;
  addIntervalToHourBuckets(started, ended, buckets);

  const ep = {
    imei: state.imei,
    codigo: state.codigo,
    tipo: state.open_tipo,
    started_at: started,
    ended_at: ended,
    duration_min: durationMin,
    recovered: Boolean(recovered),
    start_hour: hourInTz(started),
    end_hour: hourInTz(ended),
    anio,
    mes,
  };
  await insertEpisodio(ep);
  await applyEpisodeToResumenSimplified(
    ep,
    hourlyWait.map((x) => Math.round(x)),
    hourlyOffline.map((x) => Math.round(x))
  );
  state.open_tipo = null;
  state.open_started_at = null;
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
      };
      states.set(imei, st);
    }

    st.codigo = codigo ?? st.codigo;
    st.row_key = rowKey;

    await bumpResumenSample(imei, anio, mes, codigo, estado, at);

    const bad = estado === 'wait' || estado === 'offline';
    if (bad) {
      if (!st.open_tipo) {
        st.open_tipo = estado;
        st.open_started_at = at;
      } else if (st.open_tipo !== estado) {
        await closeOpen(st, at, false);
        st.open_tipo = estado;
        st.open_started_at = at;
      }
    } else if (estado === 'online') {
      if (st.open_tipo) {
        await closeOpen(st, at, true);
      }
    }

    st.last_estado = estado;
    st.last_captured_at = at;
  }

  // Persist device states touched
  for (const st of states.values()) {
    await upsertDeviceState(st);
  }

  return { processed: samples.length, lastAt };
}

/**
 * Consume samples nuevos desde el cursor (puede correr en background).
 */
export async function processSenalIncremental({ maxBatches = 20, batchSize = 4000 } = {}) {
  let total = 0;
  let cursor = await getSenalCursor();

  for (let i = 0; i < maxBatches; i++) {
    const batch = await fetchSamplesAfter(cursor, batchSize);
    if (!batch.length) break;
    const { processed, lastAt } = await processSampleBatch(batch);
    total += processed;
    if (lastAt) {
      cursor = lastAt;
      await setSenalCursor(lastAt);
    }
    if (batch.length < batchSize) break;
  }

  // Cerrar meses pasados si el cursor ya los superó
  await finalizePastMonths(cursor);

  return { processed: total, cursor };
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

/**
 * Reporte desde infraestructura persistida (no reconsulta flota completa).
 */
export async function getPersistedMonthReport(anio, mes, imei = null) {
  const ensure = await ensureMonthMaterialized(anio, mes);
  const range = monthRangeUtc(anio, mes);
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

  const hourlyWaitMin = EMPTY_HOURS();
  const hourlyOfflineMin = EMPTY_HOURS();
  for (const r of resumenRows) {
    for (let h = 0; h < 24; h++) {
      hourlyWaitMin[h] += r.hourly_wait_min[h] || 0;
      hourlyOfflineMin[h] += r.hourly_offline_min[h] || 0;
    }
  }

  const devices = resumenRows.map((r) => {
    const st = states.get(r.imei);
    const eps = (episodiosByImei.get(r.imei) ?? []).map((e) => ({
      tipo: e.tipo,
      startedAt: new Date(e.started_at).toISOString(),
      endedAt: new Date(e.ended_at).toISOString(),
      durationMin: e.duration_min,
      recovered: e.recovered,
      startHour: e.start_hour,
      endHour: e.end_hour,
    }));
    // Episodio abierto actual (si aplica al mes)
    if (st?.open_tipo && st.open_started_at) {
      const started = new Date(st.open_started_at);
      const { anio: oa, mes: om } = anioMesInTz(started);
      if (oa === anio && om === mes) {
        const endAt = st.last_captured_at
          ? new Date(st.last_captured_at)
          : new Date();
        eps.unshift({
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
        });
      }
    }

    const waitAvg =
      r.wait_episodes > 0
        ? Math.round(r.wait_total_min / r.wait_episodes)
        : 0;
    const offlineAvg =
      r.offline_episodes > 0
        ? Math.round(r.offline_total_min / r.offline_episodes)
        : 0;

    const ubi = ubiByImei.get(r.imei) ?? null;
    return {
      imei: r.imei,
      codigo: r.codigo,
      rowKey: st?.row_key ?? r.imei,
      samples: r.samples_seen,
      lastEstado: r.last_estado ?? st?.last_estado ?? '',
      lastCapturedAt: r.last_captured_at
        ? new Date(r.last_captured_at).toISOString()
        : null,
      waitEpisodes: r.wait_episodes,
      waitRecovered: r.wait_recovered,
      waitAvgMin: waitAvg,
      waitTotalMin: r.wait_total_min,
      offlineEpisodes: r.offline_episodes,
      offlineRecovered: r.offline_recovered,
      offlineAvgMin: offlineAvg,
      offlineTotalMin: r.offline_total_min,
      episodes: eps,
      ubicacion: ubi
        ? {
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
          }
        : r.pais || r.departamento || r.zona
          ? {
              imei: r.imei,
              pais: r.pais,
              departamento: r.departamento,
              provincia: r.provincia,
              distrito: r.distrito,
              zona: r.zona,
              observaciones: r.observaciones,
              latitud: r.latitud,
              longitud: r.longitud,
            }
          : null,
    };
  });

  const withWait = devices.filter((d) => d.waitEpisodes > 0).length;
  const withOffline = devices.filter((d) => d.offlineEpisodes > 0).length;
  const stillBad = devices.filter(
    (d) => d.lastEstado === 'wait' || d.lastEstado === 'offline'
  ).length;
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
    ensureStatus: ensure.status,
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

/** Wrapper seguro para cron. */
export async function processSenalIncrementalSafe() {
  try {
    const r = await processSenalIncremental({ maxBatches: 10 });
    return r;
  } catch (e) {
    console.warn('[senal] incremental:', e.message);
    return { processed: 0, error: e.message };
  }
}
