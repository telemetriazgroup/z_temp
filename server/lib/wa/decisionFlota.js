import { readJson, writeJson } from '../store.js';
import { getDeviceAlertConfig } from '../deviceAlertConfigRepository.js';

const FILE = 'waDecisionFlota.json';

function leerTodas() {
  return readJson(FILE, {});
}

export function leerDecision(rowKey) {
  if (!rowKey) return null;
  return leerTodas()[rowKey] ?? null;
}

export function guardarDecision({ rowKey, imei, enWhatsapp, reporteAutomatico }) {
  if (!rowKey) throw new Error('Falta el equipo');
  const all = leerTodas();
  const prev = all[rowKey] ?? {};
  const entry = {
    ...prev,
    rowKey,
    imei: imei || prev.imei || null,
    enWhatsapp: enWhatsapp !== false,
    reporteAutomatico: reporteAutomatico === true,
    updatedAt: new Date().toISOString(),
  };
  all[rowKey] = entry;
  writeJson(FILE, all);
  return entry;
}

export function excluidoDeWhatsapp(rowKey) {
  return leerDecision(rowKey)?.enWhatsapp === false;
}

/** El equipo está en un grupo de correo activo o tiene rango/tiempos propios. */
export function tieneAlertaCorreo(rowKey) {
  if (!rowKey) return false;
  const grupos = readJson('grupos.json', []);
  for (const g of grupos) {
    if (!g || g.enabled === false) continue;
    const correos = (g.emails ?? []).map((e) => String(e).trim()).filter(Boolean);
    if (!correos.length) continue;
    const esta = (g.devices ?? []).some(
      (d) => d && d.enabled !== false && String(d.rowKey) === String(rowKey)
    );
    if (esta) return true;
  }
  const cfg = getDeviceAlertConfig(rowKey);
  if (!cfg) return false;
  return Boolean(
    cfg.useRangoPersonalizado || cfg.mode === 'custom' || cfg.alerta30Minutos || cfg.alerta1Hora
  );
}

/**
 * Incidentes y alertas automáticas: los que el superadmin marcó,
 * o los que ya tienen alerta de correo, salvo que los haya apagado.
 */
export function permiteReporteAutomatico(rowKey) {
  const decision = leerDecision(rowKey);
  if (decision && decision.reporteAutomatico === false) return false;
  if (decision && decision.reporteAutomatico === true) return true;
  return tieneAlertaCorreo(rowKey);
}

export function vistaDecision(rowKey) {
  const decision = leerDecision(rowKey);
  const cfg = getDeviceAlertConfig(rowKey);
  const enGrupo = tieneAlertaCorreo(rowKey);
  return {
    enWhatsapp: decision ? decision.enWhatsapp !== false : true,
    reporteAutomatico: decision ? decision.reporteAutomatico === true : enGrupo,
    correo: {
      configurado: Boolean(cfg?.useRangoPersonalizado || cfg?.mode === 'custom' || enGrupo),
      enGrupo,
      useRangoPersonalizado: cfg?.useRangoPersonalizado === true,
      margenInferior: cfg?.useRangoPersonalizado ? cfg.margenInferior ?? 4 : 4,
      margenSuperior: cfg?.useRangoPersonalizado ? cfg.margenSuperior ?? 4 : 4,
    },
  };
}
