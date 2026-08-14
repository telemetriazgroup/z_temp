import { fetchAllDispositivos, deviceRowKey } from '../telemetry.js';
import {
  getDeviceAlertConfigMap,
} from '../deviceAlertConfigRepository.js';
import { isEquipoApagado, isEquipoEncendido, defrostActivoEfectivo } from '../powerState.js';
import { effectiveEnRangoFromDispositivo } from '../historicalTelemetry.js';
import {
  saveSnapshotTransaction,
  pruneDashboardHistory,
} from './repository.js';

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
  if (!user || user.superUser === true || user.deviceAccess?.includes('all')) {
    return dispositivos;
  }
  const allowed = new Set((user.deviceAccess ?? []).map(String));
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

/**
 * Captura flota actual y la persiste en PostgreSQL.
 */
export async function captureDashboardSnapshot() {
  const dispositivos = await fetchAllDispositivos();
  const { fleet, samples } = computeFleetCounts(dispositivos);
  const saved = await saveSnapshotTransaction(fleet, samples);
  try {
    await pruneDashboardHistory();
  } catch (e) {
    console.warn('[dashboard] prune:', e.message);
  }
  return {
    ...saved,
    total: fleet.total,
    online: fleet.online,
    wait: fleet.wait,
    offline: fleet.offline,
    en_rango: fleet.en_rango,
    fuera_rango: fleet.fuera_rango,
  };
}

let capturing = false;

export async function captureDashboardSnapshotSafe() {
  if (capturing) return { skipped: 'busy' };
  capturing = true;
  try {
    return await captureDashboardSnapshot();
  } finally {
    capturing = false;
  }
}
