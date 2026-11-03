import { fetchSourcesDetailed, deviceRowKey } from '../telemetry.js';
import { recordLinkProbes } from './linkHealth.js';
import { upsertKnownDevices } from './deviceRegistry.js';
import { ensureDashboardSchema } from '../db.js';
import {
  countCurrentDevices,
  getSyncState,
  loadCurrentDispositivos,
  markSourceDevicesAbsent,
  saveSyncState,
  upsertCurrentDevices,
} from './fleetStore.js';
import {
  getDeviceAlertConfigMap,
} from '../deviceAlertConfigRepository.js';
import { isEquipoApagado, isEquipoEncendido, defrostActivoEfectivo } from '../powerState.js';
import { effectiveEnRangoFromDispositivo } from '../historicalTelemetry.js';
import {
  saveSnapshotTransaction,
  pruneDashboardHistory,
} from './repository.js';
import { resolveUserEffectiveImeis } from '../gruposEquiposRepository.js';
import { pickTelemetryFromDispositivo } from '../senal/telemetry.js';

function conexionOf(d) {
  const s = String(d.estado_conexion ?? '').toLowerCase();
  if (s === 'online' || s === 'wait') return s;
  return 'offline';
}

function rangoOptsFromConfig(cfg) {
  if (!cfg?.useRangoPersonalizado) return null;
  return {
    useRangoPersonalizado: true,
    margenInferior: cfg.margenInferior ?? 0.5,
    margenSuperior: cfg.margenSuperior ?? 0.5,
  };
}

function evaluarRangoEstado(dispositivo, rangoOpts) {
  if (isEquipoApagado(dispositivo) === true) return 'apagado';
  if (isEquipoEncendido(dispositivo) !== true) return 'indeterminado';
  const enRango = effectiveEnRangoFromDispositivo(dispositivo, rangoOpts);
  if (enRango === true) return 'normal';
  if (enRango === false) return 'fuera';
  if (dispositivo.en_rango === true) return 'normal';
  if (dispositivo.en_rango === false) return 'fuera';
  return 'indeterminado';
}

function emptyByCodigoBucket() {
  return {
    total: 0,
    online: 0,
    wait: 0,
    offline: 0,
    en_rango: 0,
    fuera_rango: 0,
    apagado: 0,
    indeterminado: 0,
  };
}

/**
 * Cuenta KPIs de una lista de dispositivos (misma lógica que listado/dashboard).
 */
export function computeFleetCounts(dispositivos, configMap = null) {
  const map = configMap ?? getDeviceAlertConfigMap();
  const counts = {
    total: 0,
    online: 0,
    wait: 0,
    offline: 0,
    power_on: 0,
    power_off: 0,
    en_defrost: 0,
    en_rango: 0,
    fuera_rango: 0,
    apagado: 0,
    indeterminado: 0,
  };
  const by_codigo = {};
  const samples = [];
  const captured_at = new Date().toISOString();

  for (const d of dispositivos) {
    const rowKey = deviceRowKey(d);
    const rangoOpts = rangoOptsFromConfig(map[rowKey]);
    const conexion = conexionOf(d);
    const rango = evaluarRangoEstado(d, rangoOpts);
    const power =
      d.power_state_texto === 'on' || d.power_state_texto === 'off'
        ? d.power_state_texto
        : null;
    const defrost = defrostActivoEfectivo(d);

    counts.total++;
    counts[conexion]++;
    if (power === 'on') counts.power_on++;
    else if (power === 'off') counts.power_off++;
    if (defrost) counts.en_defrost++;
    if (rango === 'normal') counts.en_rango++;
    else if (rango === 'fuera') counts.fuera_rango++;
    else if (rango === 'apagado') counts.apagado++;
    else counts.indeterminado++;

    const codigo = d.codigo ? String(d.codigo).toUpperCase() : 'OTRO';
    if (!by_codigo[codigo]) by_codigo[codigo] = emptyByCodigoBucket();
    const bc = by_codigo[codigo];
    bc.total++;
    bc[conexion]++;
    if (rango === 'normal') bc.en_rango++;
    else if (rango === 'fuera') bc.fuera_rango++;
    else if (rango === 'apagado') bc.apagado++;
    else bc.indeterminado++;

    samples.push({
      captured_at,
      imei: d.imei,
      codigo: d.codigo ?? null,
      row_key: rowKey,
      estado_conexion: conexion,
      power_state: power,
      rango_estado: rango,
      en_defrost: defrost,
      telemetry: pickTelemetryFromDispositivo(d, captured_at),
    });
  }

  const knownRango = counts.en_rango + counts.fuera_rango;
  const pct_online =
    counts.total > 0 ? Math.round((1000 * counts.online) / counts.total) / 10 : 0;
  const pct_en_rango =
    knownRango > 0
      ? Math.round((1000 * counts.en_rango) / knownRango) / 10
      : null;

  return {
    fleet: {
      captured_at,
      ...counts,
      pct_online,
      pct_en_rango,
      by_codigo,
    },
    samples,
    dispositivos,
  };
}

export function filterDispositivosForUser(dispositivos, user) {
  if (!user || user.superUser === true || user.category === 'superadmin') {
    return dispositivos;
  }
  if (user.deviceAccess?.includes('all')) {
    return dispositivos;
  }
  const allowedList = resolveUserEffectiveImeis(user);
  if (allowedList == null) return dispositivos;
  const allowed = new Set(allowedList.map(String));
  const codigos = Array.isArray(user.allowedCodigos)
    ? new Set(user.allowedCodigos.map((c) => String(c).toUpperCase()))
    : null;
  return dispositivos.filter((d) => {
    if (!allowed.has(d.imei)) return false;
    if (codigos && codigos.size > 0) {
      const code = d.codigo ? String(d.codigo).toUpperCase() : '';
      if (!codigos.has(code)) return false;
    }
    return true;
  });
}

function linkSummary(link) {
  return {
    codigo: link.codigo,
    url: link.url,
    ok: link.ok,
    latencyMs: link.latencyMs ?? null,
    error: link.error ?? null,
    deviceCount: link.dispositivos?.length ?? 0,
  };
}

/**
 * El sistema consulta las APIs y deja la flota en PostgreSQL.
 * Un origen lento o caído no borra sus equipos: se conserva el último payload.
 * Una respuesta vacía tampoco marca ausencias (evita un glitch que vacíe el origen).
 */
export async function captureDashboardSnapshot({ trigger = 'interval' } = {}) {
  await ensureDashboardSchema();
  const startedAt = new Date().toISOString();
  await saveSyncState({
    started_at: startedAt,
    finished_at: null,
    trigger,
    ok: null,
    error: null,
    detail: { phase: 'fetching' },
  });

  const { links } = await fetchSourcesDetailed({ timeoutMs: 50_000 });
  const seenAt = new Date().toISOString();
  const summaries = [];

  for (const link of links) {
    summaries.push(linkSummary(link));
    if (!link.ok) continue;
    const list = Array.isArray(link.dispositivos) ? link.dispositivos : [];
    if (list.length === 0) continue;
    await upsertCurrentDevices(list, seenAt);
    await markSourceDevicesAbsent(
      link.codigo,
      list.map((d) => deviceRowKey(d)),
      seenAt
    );
  }

  try {
    await recordLinkProbes(links);
  } catch (e) {
    console.warn('[dashboard] sondas:', e.message);
  }

  const stored = await loadCurrentDispositivos();
  if (stored.length > 0) {
    try {
      await upsertKnownDevices(stored);
    } catch (e) {
      console.warn('[dashboard] equipos conocidos:', e.message);
    }
  }

  let saved = null;
  let fleetCounts = null;
  if (stored.length > 0) {
    const { fleet, samples } = computeFleetCounts(stored);
    fleetCounts = fleet;
    saved = await saveSnapshotTransaction(fleet, samples);
    try {
      await pruneDashboardHistory();
    } catch (e) {
      console.warn('[dashboard] prune:', e.message);
    }
  }

  const counts = await countCurrentDevices();
  const anyOk = summaries.some((l) => l.ok && l.deviceCount > 0);
  const detail = {
    links: summaries,
    ...counts,
    snapshotId: saved?.id ?? null,
  };
  const finishedAt = new Date().toISOString();
  const error = anyOk || stored.length > 0 ? null : 'Ningún origen devolvió equipos';
  await saveSyncState({
    started_at: startedAt,
    finished_at: finishedAt,
    trigger,
    ok: error == null,
    error,
    detail,
  });

  return {
    id: saved?.id ?? null,
    captured_at: saved?.captured_at ?? finishedAt,
    total: fleetCounts?.total ?? counts.total,
    online: fleetCounts?.online ?? 0,
    wait: fleetCounts?.wait ?? 0,
    offline: fleetCounts?.offline ?? 0,
    en_rango: fleetCounts?.en_rango ?? 0,
    fuera_rango: fleetCounts?.fuera_rango ?? 0,
    ...counts,
    links: summaries,
    trigger,
    finishedAt,
  };
}

let capturing = false;

export async function captureDashboardSnapshotSafe(opts) {
  if (capturing) return { skipped: 'busy' };
  capturing = true;
  try {
    return await captureDashboardSnapshot(opts);
  } catch (e) {
    await saveSyncState({
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      trigger: opts?.trigger ?? 'interval',
      ok: false,
      error: e?.message ?? String(e),
      detail: (await getSyncState().catch(() => null))?.detail ?? {},
    }).catch(() => {});
    throw e;
  } finally {
    capturing = false;
  }
}

export function dashboardSyncInProgress() {
  return capturing;
}
