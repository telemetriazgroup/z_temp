import { parseTelemetryTimestamp, CORREO_TZ } from '../timezone.js';

const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

function partsInTz(d) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CORREO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const out = {};
  for (const p of formatter.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** Medianoche GMT-5 del día calendario de `d`. */
export function startOfDayGmt5(d) {
  const p = partsInTz(d instanceof Date ? d : new Date(d));
  return parseTelemetryTimestamp(`${p.year}-${p.month}-${p.day}T00:00:00`);
}

/** Inicio (lun 00:00) y fin (dom 23:59:59.999) de la semana GMT-5 que contiene `ts`. */
export function weekBoundsContaining(ts) {
  const dayStart = startOfDayGmt5(ts);
  const p = partsInTz(new Date(dayStart));
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = weekdayMap[p.weekday] ?? 0;
  const monday = dayStart - offset * MS_DIA;
  const sundayEnd = monday + 7 * MS_DIA - 1;
  return { desde: monday, hasta: sundayEnd };
}

/**
 * Particiona el mes (anio, mes 1-12) en semanas lun–dom recortadas al mes (GMT-5).
 */
export function weeksOfMonth(anio, mes) {
  const monthStart = parseTelemetryTimestamp(
    `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00`
  );
  const nextMonth =
    mes === 12
      ? parseTelemetryTimestamp(`${anio + 1}-01-01T00:00:00`)
      : parseTelemetryTimestamp(
          `${anio}-${String(mes + 1).padStart(2, '0')}-01T00:00:00`
        );
  const monthEnd = nextMonth - 1;

  const weeks = [];
  let cursor = monthStart;
  let index = 1;
  while (cursor <= monthEnd) {
    const { desde, hasta } = weekBoundsContaining(cursor);
    const wFrom = Math.max(desde, monthStart);
    const wTo = Math.min(hasta, monthEnd);
    weeks.push({
      semanaIndex: index,
      desde: wFrom,
      hasta: wTo,
    });
    index += 1;
    cursor = wTo + 1;
  }
  return weeks;
}

/** Horas de un evento solapadas con [from, to]. */
export function hoursOverlap(sinceIso, untilIso, fromMs, toMs, openEnd = Date.now()) {
  const a0 = parseTelemetryTimestamp(sinceIso);
  const a1 = untilIso == null ? openEnd : parseTelemetryTimestamp(untilIso);
  if (Number.isNaN(a0) || Number.isNaN(a1)) return 0;
  const start = Math.max(a0, fromMs);
  const end = Math.min(a1, toMs);
  if (end <= start) return 0;
  return Math.round(((end - start) / MS_HORA) * 10) / 10;
}

export function aggregateWeeks(anio, mes, eventos, openEnd = Date.now()) {
  const weeks = weeksOfMonth(anio, mes);
  return weeks.map((w) => {
    let horasFuera = 0;
    let horasApagado = 0;
    let horasSinTx = 0;
    for (const ev of eventos) {
      const h = hoursOverlap(ev.since, ev.until, w.desde, w.hasta, openEnd);
      if (ev.tipo === 'fuera_rango') horasFuera += h;
      else if (ev.tipo === 'apagado') horasApagado += h;
      else if (ev.tipo === 'sin_transmision') horasSinTx += h;
    }
    return {
      semanaIndex: w.semanaIndex,
      desde: new Date(w.desde).toISOString(),
      hasta: new Date(w.hasta).toISOString(),
      horasFueraRango: Math.round(horasFuera * 10) / 10,
      horasApagado: Math.round(horasApagado * 10) / 10,
      horasSinTransmision: Math.round(horasSinTx * 10) / 10,
    };
  });
}

/** Límites del mes calendario GMT-5; fin acotado a `now` si es mes actual. */
export function monthWindow(anio, mes, now = new Date()) {
  const desde = parseTelemetryTimestamp(
    `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00`
  );
  const next =
    mes === 12
      ? parseTelemetryTimestamp(`${anio + 1}-01-01T00:00:00`)
      : parseTelemetryTimestamp(
          `${anio}-${String(mes + 1).padStart(2, '0')}-01T00:00:00`
        );
  const finMes = next - 1;
  const hasta = Math.min(finMes, now.getTime());
  return {
    desdeMs: desde,
    hastaMs: hasta,
    finMesMs: finMes,
    desde: new Date(desde),
    hasta: new Date(hasta),
  };
}
