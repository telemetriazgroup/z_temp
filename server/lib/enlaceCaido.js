import { parseTelemetryTimestamp } from './timezone.js';

/** Horas desde la última comunicación del equipo. null si no hay marca de tiempo. */
export function horasSinComunicacion(dispositivo, now) {
  const mins = dispositivo?.minutos_desde_ultimo_dato;
  if (mins != null && !Number.isNaN(Number(mins))) {
    return Math.max(0, Number(mins) / 60);
  }
  const ua = parseTelemetryTimestamp(dispositivo?.ultima_actualizacion);
  if (Number.isNaN(ua)) return null;
  return Math.max(0, (now.getTime() - ua) / (60 * 60 * 1000));
}

/**
 * Un enlace (TUNEL, STARCOOL, …) está caído cuando todos sus equipos
 * llevan al menos `horasMin` sin comunicación. Un equipo aislado de otro
 * enlace que sí reporta no entra aquí.
 * @returns {{ codigo: string, equipos: number, horas: number, since: string | null }[]}
 */
export function detectarEnlacesCaidos(dispositivos, now = new Date(), horasMin = 3) {
  const byCodigo = new Map();
  for (const d of dispositivos ?? []) {
    if (d?.ausente_api === true || String(d?.estado_conexion ?? '').toLowerCase() === 'historial') {
      continue;
    }
    const codigo = String(d?.codigo ?? '').trim();
    if (!codigo) continue;
    if (!byCodigo.has(codigo)) byCodigo.set(codigo, []);
    byCodigo.get(codigo).push(d);
  }

  const caidos = [];
  for (const [codigo, lista] of byCodigo) {
    if (lista.length === 0) continue;
    let freshest = Infinity;
    let freshestMs = null;
    let todosCallados = true;
    for (const d of lista) {
      const horas = horasSinComunicacion(d, now);
      if (horas == null || horas < horasMin) {
        todosCallados = false;
        break;
      }
      if (horas < freshest) freshest = horas;
      const ua = parseTelemetryTimestamp(d.ultima_actualizacion);
      if (!Number.isNaN(ua) && (freshestMs == null || ua > freshestMs)) freshestMs = ua;
    }
    if (!todosCallados) continue;
    caidos.push({
      codigo,
      equipos: lista.length,
      horas: Math.round(freshest * 10) / 10,
      since: freshestMs != null ? new Date(freshestMs).toISOString() : null,
    });
  }
  return caidos;
}
