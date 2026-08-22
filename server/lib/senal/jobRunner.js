import {
  getSenalJob,
  updateSenalJob,
  resetSenalComputed,
  getResumenMes,
  listKnownDevices,
} from './repository.js';
import { processSenalIncremental } from './engine.js';
import { getDeviceNameByImei } from '../deviceNamesRepository.js';

let timer = null;
let ticking = false;

function mapJob(row) {
  if (!row) {
    return {
      status: 'idle',
      mode: 'incremental',
      processed: 0,
      devicesSeen: 0,
      lastImei: null,
      lastNombre: null,
      lastCapturedAt: null,
      error: null,
      startedAt: null,
      startedBy: null,
      updatedAt: null,
    };
  }
  return {
    status: row.status,
    mode: row.mode,
    processed: Number(row.processed) || 0,
    devicesSeen: Number(row.devices_seen) || 0,
    lastImei: row.last_imei ?? null,
    lastNombre: row.last_nombre ?? null,
    lastCapturedAt: row.last_captured_at
      ? new Date(row.last_captured_at).toISOString()
      : null,
    error: row.error ?? null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    startedBy: row.started_by ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function readSenalJob() {
  try {
    return mapJob(await getSenalJob());
  } catch {
    return mapJob(null);
  }
}

async function tick() {
  if (ticking) return;
  let job;
  try {
    job = await getSenalJob();
  } catch {
    return;
  }
  if (job?.status !== 'running') return;

  ticking = true;
  try {
    const r = await processSenalIncremental({ maxBatches: 1, batchSize: 250 });
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    let devicesSeen = job.devices_seen ?? 0;
    try {
      const [resumen, known] = await Promise.all([
        getResumenMes(anio, mes),
        listKnownDevices(),
      ]);
      devicesSeen = new Set([
        ...resumen.map((row) => row.imei),
        ...known.map((k) => k.imei).filter(Boolean),
      ]).size;
    } catch {
      /* ignore */
    }

    const lastImei = r.lastImei ?? job.last_imei ?? null;
    await updateSenalJob({
      status: 'running',
      processed: (job.processed ?? 0) + (r.processed ?? 0),
      devices_seen: devicesSeen,
      last_imei: lastImei,
      last_nombre: lastImei ? getDeviceNameByImei(lastImei) : job.last_nombre,
      last_captured_at: r.cursor ?? job.last_captured_at,
      error: null,
    });
  } catch (e) {
    await updateSenalJob({ status: 'error', error: e.message }).catch(() => {});
  } finally {
    ticking = false;
  }
}

export function startSenalJobRunner() {
  if (timer) return;
  timer = setInterval(() => void tick(), 1500);
}

export async function startSenalJob({ fromScratch = false, actor = null } = {}) {
  if (fromScratch) {
    await resetSenalComputed();
  }
  const job = await updateSenalJob({
    status: 'running',
    mode: fromScratch ? 'from_scratch' : 'incremental',
    processed: fromScratch ? 0 : undefined,
    devices_seen: fromScratch ? 0 : undefined,
    error: null,
    started_at: new Date(),
    started_by: actor ?? null,
  });
  startSenalJobRunner();
  return mapJob(job);
}

export async function pauseSenalJob() {
  const job = await updateSenalJob({ status: 'paused' });
  return mapJob(job);
}

export async function resumeSenalJob(actor = null) {
  const current = await getSenalJob();
  const job = await updateSenalJob({
    status: 'running',
    error: null,
    started_by: actor ?? current?.started_by ?? null,
    started_at: current?.started_at ?? new Date(),
  });
  startSenalJobRunner();
  return mapJob(job);
}
