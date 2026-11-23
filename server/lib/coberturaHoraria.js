import { parseTelemetryTimestamp, startOfDayMs } from './timezone.js';

/** Horas que deben pasar tras el fin de la ventana para avisar al cliente. */
export const HORAS_CLIENTE_TRAS_COBERTURA = 2;

export function normalizarHora(value) {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function aMinutos(hhmm) {
  const n = normalizarHora(hhmm);
  if (!n) return null;
  const [h, m] = n.split(':').map(Number);
  return h * 60 + m;
}

function minutosLima(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now instanceof Date ? now : new Date(now));
  let h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  if (h === 24) h = 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** True entre desde y hasta, hora Lima. Si hasta es menor, la ventana cruza la medianoche. */
export function enVentanaSinSenal(desde, hasta, now = new Date()) {
  const a = aMinutos(desde);
  const b = aMinutos(hasta);
  const n = minutosLima(now);
  if (a == null || b == null || n == null || a === b) return false;
  if (a < b) return n >= a && n < b;
  return n >= a || n < b;
}

/** Último instante en que terminó la ventana, si ahora está fuera de ella. */
export function finDeVentanaMs(desde, hasta, now = new Date()) {
  if (enVentanaSinSenal(desde, hasta, now)) return null;
  const a = aMinutos(desde);
  const b = aMinutos(hasta);
  const n = minutosLima(now);
  if (a == null || b == null || n == null) return null;
  const hoy0 = startOfDayMs(now);
  const dia = 24 * 60 * 60 * 1000;
  if (a < b) {
    if (n >= b) return hoy0 + b * 60 * 1000;
    return hoy0 - dia + b * 60 * 1000;
  }
  return hoy0 + b * 60 * 1000;
}

/**
 * Horas de fuera de línea que ve el cliente.
 * Dentro de la ventana no se cuenta. Fuera, el reloj arranca en el fin de la
 * ventana o en la última comunicación, la que sea más reciente.
 */
export function cuentaCliente(ultimaIso, desde, hasta, now = new Date()) {
  const fin = finDeVentanaMs(desde, hasta, now);
  if (fin == null) return null;
  const ahora = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const ultima = parseTelemetryTimestamp(ultimaIso);
  const inicio = Number.isFinite(ultima) ? Math.max(ultima, fin) : fin;
  const horas = Math.max(0, (ahora - inicio) / 3600000);
  return { inicioMs: inicio, horas: Math.round(horas * 100) / 100 };
}
