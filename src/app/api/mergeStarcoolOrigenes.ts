import type { DispositivoOrigenCodigo, DispositivoUltimoEstado } from '../types';
import { parseTelemetryTimestampClient } from '../lib/telemetryTimezone';

const STARCOOL_CODIGOS = new Set<DispositivoOrigenCodigo>([
  'STARCOOL',
  'STARCOOL2',
]);

function tsUltimaActualizacion(d: DispositivoUltimoEstado): number {
  return parseTelemetryTimestampClient(d.ultima_actualizacion);
}

/**
 * Entre STARCOOL y STARCOOL2 con el mismo IMEI:
 * - gana el de `ultima_actualizacion` más reciente (más cerca de ahora);
 * - empate / sin fecha → prioriza STARCOOL2.
 */
export function preferirEntreStarcool(
  a: DispositivoUltimoEstado,
  b: DispositivoUltimoEstado
): DispositivoUltimoEstado {
  const ta = tsUltimaActualizacion(a);
  const tb = tsUltimaActualizacion(b);
  const aOk = !Number.isNaN(ta);
  const bOk = !Number.isNaN(tb);

  if (aOk && bOk) {
    if (tb > ta) return b;
    if (ta > tb) return a;
  } else if (aOk) {
    return a;
  } else if (bOk) {
    return b;
  }

  if (a.codigo === 'STARCOOL2') return a;
  if (b.codigo === 'STARCOOL2') return b;
  return a;
}

/**
 * Deduplica IMEIs que aparecen en STARCOOL y STARCOOL2.
 * Otros orígenes (TUNEL, TERMOKING) se dejan intactos.
 */
export function mergeStarcoolOrigenes(
  dispositivos: DispositivoUltimoEstado[]
): DispositivoUltimoEstado[] {
  const porImei = new Map<string, DispositivoUltimoEstado>();
  const resto: DispositivoUltimoEstado[] = [];

  for (const d of dispositivos) {
    const codigo = d.codigo;
    if (codigo == null || !STARCOOL_CODIGOS.has(codigo)) {
      resto.push(d);
      continue;
    }
    const prev = porImei.get(d.imei);
    if (prev == null) {
      porImei.set(d.imei, d);
    } else {
      porImei.set(d.imei, preferirEntreStarcool(prev, d));
    }
  }

  return [...resto, ...porImei.values()];
}
