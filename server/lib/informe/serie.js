import { fetchHistorialRango, timestampRegistroHistorial } from '../historicalTelemetry.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function limaParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

function wallClock(date) {
  const p = limaParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Rangos mensuales inclusivos. Un mismo día cubre ese día entero, de 00:00:00 a 23:59:59 (Lima). */
export function rangosMensuales(desde, hasta) {
  const start = new Date(`${desde}T00:00:00-05:00`);
  const end = new Date(`${hasta}T23:59:59-05:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('El rango de fechas no es válido');
  }
  const spanDays = (end.getTime() - start.getTime()) / DAY_MS;
  if (spanDays > 370) {
    throw new Error('El informe admite como máximo 12 meses por generación');
  }
  const out = [];
  let cursor = start;
  while (cursor <= end) {
    const p = limaParts(cursor);
    const monthEnd = new Date(
      `${p.year}-${p.month}-${lastDay(p.year, p.month)}T23:59:59-05:00`
    );
    const sliceEnd = monthEnd < end ? monthEnd : end;
    out.push({ from: new Date(cursor), to: sliceEnd });
    cursor = new Date(sliceEnd.getTime() + 1000);
  }
  return out;
}

function lastDay(year, month) {
  return String(new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()).padStart(2, '0');
}

function num(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

function mapRow(row, imei) {
  const ts = timestampRegistroHistorial(row);
  if (Number.isNaN(ts)) return null;
  return {
    ts,
    fecha: wallClock(new Date(ts)),
    temp_supply_1: num(row.temp_supply_1),
    return_air: num(row.return_air),
    evaporation_coil: num(row.evaporation_coil),
    set_point: num(row.set_point),
    power_state: row.power_state == null || row.power_state === '' ? '' : String(row.power_state),
    imei: String(row.imei ?? imei),
  };
}

/**
 * Serie oficial del equipo (buscar_datos_oficiales), no el muestreo de 5 minutos.
 * Esa copia de tablero no guarda el evaporador ni la historia densa que el informe necesita.
 */
export async function cargarSerieEquipo({ codigo, imei, desde, hasta }) {
  const rangos = rangosMensuales(desde, hasta);
  const byTs = new Map();
  for (const rango of rangos) {
    const hist = await fetchHistorialRango(codigo, imei, rango.from, rango.to);
    for (const row of hist?.datos ?? []) {
      const mapped = mapRow(row, imei);
      if (!mapped) continue;
      if (!byTs.has(mapped.ts)) byTs.set(mapped.ts, mapped);
    }
  }
  const rows = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  if (!rows.length) {
    throw new Error('No hay telemetría oficial en ese rango para este equipo');
  }
  return rows;
}

export function serieACsv(rows) {
  const header = 'fecha,temp_supply_1,return_air,evaporation_coil,set_point,power_state,imei';
  const lines = rows.map(
    (r) =>
      `${r.fecha},${r.temp_supply_1},${r.return_air},${r.evaporation_coil},${r.set_point},${r.power_state},${r.imei}`
  );
  return `${header}\n${lines.join('\n')}\n`;
}
