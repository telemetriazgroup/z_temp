import { query } from '../db.js';
import { listSenalUbicaciones } from './ubicacionRepository.js';
import { classifySenalTipo, mergeAndClassifyLazos, countLazosByTipo } from './classify.js';

const TZ = 'America/Lima';

/**
 * @param {number} anio
 * @param {number} mes 1-12
 */
export function monthRangeUtc(anio, mes) {
  const y = Number(anio);
  const m = Number(mes);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Año/mes inválidos');
  }
  const fromLocal = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const toLocal = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00`;
  return {
    fromIso: fromLocal,
    toIso: toLocal,
    anio: y,
    mes: m,
  };
}

function hourInTz(date, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return h === 24 ? 0 : h;
}

/**
 * Atribuye minutos de un intervalo [a,b] a cada hora del día (0-23) en TZ.
 * @param {Date} a
 * @param {Date} b
 * @param {number[]} buckets
 */
function addIntervalToHourBuckets(a, b, buckets) {
  let t = a.getTime();
  const end = b.getTime();
  if (!(end > t)) return;
  while (t < end) {
    const cur = new Date(t);
    const h = hourInTz(cur);
    const nextHour = new Date(cur);
    // advance to next hour boundary in absolute ms (~60m)
    const msIntoHour =
      (cur.getUTCMinutes() * 60 + cur.getUTCSeconds()) * 1000 +
      cur.getUTCMilliseconds();
    // Approximate: add remaining of current clock hour in TZ by stepping 1 min
    const stepEnd = Math.min(t + 60_000, end);
    buckets[h] += (stepEnd - t) / 60_000;
    t = stepEnd;
  }
}

/**
 * @param {Array<{imei:string,codigo:string|null,row_key:string,estado_conexion:string,captured_at:Date|string}>} samples
 */
export function buildEpisodesFromSamples(samples) {
  /** @type {Map<string, typeof samples>} */
  const byImei = new Map();
  for (const s of samples) {
    const imei = String(s.imei);
    if (!byImei.has(imei)) byImei.set(imei, []);
    byImei.get(imei).push(s);
  }

  const devices = [];
  const hourlyWait = Array(24).fill(0);
  const hourlyOffline = Array(24).fill(0);

  for (const [imei, list] of byImei) {
    list.sort(
      (a, b) =>
        new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
    const codigo = list.find((x) => x.codigo)?.codigo ?? null;
    const rowKey = list.find((x) => x.row_key)?.row_key ?? imei;

    /** @type {Array<object>} */
    const episodes = [];
    let open = null;

    const closeOpen = (endAt, recovered) => {
      if (!open) return;
      const startMs = open.startedAt.getTime();
      const endMs = endAt.getTime();
      const durationMin = Math.max(0, Math.round((endMs - startMs) / 60_000));
      const tipo = classifySenalTipo(durationMin);
      if (tipo) {
        episodes.push({
          tipo,
          startedAt: open.startedAt.toISOString(),
          endedAt: endAt.toISOString(),
          durationMin,
          recovered,
          startHour: hourInTz(open.startedAt),
          endHour: hourInTz(endAt),
        });
        const buckets = tipo === 'wait' ? hourlyWait : hourlyOffline;
        addIntervalToHourBuckets(open.startedAt, endAt, buckets);
      }
      open = null;
    };

    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const at = new Date(s.captured_at);
      const estado = String(s.estado_conexion ?? '').toLowerCase();
      const bad = estado === 'wait' || estado === 'offline';

      if (bad) {
        if (!open) {
          open = { tipo: 'wait', startedAt: at };
        }
        // attribute gap to next sample for open streak later
      } else if (estado === 'online') {
        if (open) closeOpen(at, true);
      }

      // Between samples, if still in bad state, attribute to hourly when we know next
      if (i < list.length - 1 && open) {
        const nextAt = new Date(list[i + 1].captured_at);
        const buckets = open.tipo === 'wait' ? hourlyWait : hourlyOffline;
        // Don't double-count: only attribute continuous open segments at close.
        // Hourly is filled in closeOpen. Between samples while open we skip until close.
        void nextAt;
        void buckets;
      }
    }

    // Still open at end of month window
    if (open) {
      const endAt = new Date(list[list.length - 1].captured_at);
      const startMs = open.startedAt.getTime();
      const durationMin = Math.max(
        0,
        Math.round((endAt.getTime() - startMs) / 60_000)
      );
      const tipo = classifySenalTipo(durationMin);
      if (tipo) {
        episodes.push({
          tipo,
          startedAt: open.startedAt.toISOString(),
          endedAt: endAt.toISOString(),
          durationMin,
          recovered: false,
          open: true,
          startHour: hourInTz(open.startedAt),
          endHour: hourInTz(endAt),
        });
        const buckets = tipo === 'wait' ? hourlyWait : hourlyOffline;
        addIntervalToHourBuckets(open.startedAt, endAt, buckets);
      }
      open = null;
    }

    const lazos = mergeAndClassifyLazos(episodes);
    const counts = countLazosByTipo(lazos);

    const last = list[list.length - 1];
    devices.push({
      imei,
      codigo,
      rowKey,
      samples: list.length,
      lastEstado: String(last?.estado_conexion ?? '').toLowerCase(),
      lastCapturedAt: last ? new Date(last.captured_at).toISOString() : null,
      waitEpisodes: counts.waitEpisodes,
      waitRecovered: counts.waitRecovered,
      waitAvgMin: counts.waitAvgMin,
      waitTotalMin: counts.waitTotalMin,
      offlineEpisodes: counts.offlineEpisodes,
      offlineRecovered: counts.offlineRecovered,
      offlineAvgMin: counts.offlineAvgMin,
      offlineTotalMin: counts.offlineTotalMin,
      episodes: lazos,
    });
  }

  devices.sort(
    (a, b) =>
      b.waitTotalMin +
      b.offlineTotalMin -
      (a.waitTotalMin + a.offlineTotalMin)
  );

  return {
    devices,
    hourlyWaitMin: hourlyWait.map((x) => Math.round(x)),
    hourlyOfflineMin: hourlyOffline.map((x) => Math.round(x)),
  };
}

/**
 * Análisis de comportamiento wait/offline → online para un mes.
 */
export async function analyzeSenalBehavior({ anio, mes, imei = null } = {}) {
  const range = monthRangeUtc(anio, mes);
  const params = [range.fromIso, range.toIso];
  let imeiFilter = '';
  if (imei) {
    params.push(String(imei));
    imeiFilter = ` AND imei = $${params.length}`;
  }

  const r = await query(
    `SELECT imei, codigo, row_key, estado_conexion, captured_at
     FROM dashboard_device_sample
     WHERE captured_at >= $1::timestamp AT TIME ZONE 'America/Lima'
       AND captured_at < $2::timestamp AT TIME ZONE 'America/Lima'
       ${imeiFilter}
     ORDER BY imei, captured_at ASC`,
    params
  );

  const built = buildEpisodesFromSamples(r.rows);
  const ubicaciones = await listSenalUbicaciones();
  const ubiByImei = new Map(ubicaciones.map((u) => [u.imei, u]));

  const devices = built.devices.map((d) => ({
    ...d,
    ubicacion: ubiByImei.get(d.imei) ?? null,
  }));

  const withWait = devices.filter((d) => d.waitEpisodes > 0).length;
  const withOffline = devices.filter((d) => d.offlineEpisodes > 0).length;
  const stillBad = devices.filter(
    (d) => d.lastEstado === 'wait' || d.lastEstado === 'offline'
  ).length;

  // Peak hours
  const peakWaitHour = built.hourlyWaitMin.indexOf(
    Math.max(...built.hourlyWaitMin, 0)
  );
  const peakOfflineHour = built.hourlyOfflineMin.indexOf(
    Math.max(...built.hourlyOfflineMin, 0)
  );

  return {
    anio: range.anio,
    mes: range.mes,
    from: range.fromIso,
    to: range.toIso,
    timezone: TZ,
    sampleCount: r.rows.length,
    deviceCount: devices.length,
    summary: {
      devicesWithWait: withWait,
      devicesWithOffline: withOffline,
      devicesStillWaitOrOffline: stillBad,
      peakWaitHour,
      peakOfflineHour,
      totalWaitMin: devices.reduce((s, d) => s + d.waitTotalMin, 0),
      totalOfflineMin: devices.reduce((s, d) => s + d.offlineTotalMin, 0),
    },
    hourlyWaitMin: built.hourlyWaitMin,
    hourlyOfflineMin: built.hourlyOfflineMin,
    devices,
  };
}
