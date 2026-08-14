import type { DatoOficialHistorial } from '../types';
import {
  formatDateTimeInTz,
  parseTelemetryTimestampClient,
  resolveDisplayTimeZone,
  TELEMETRY_SOURCE_TZ,
} from './telemetryTimezone';
import {
  formatTemperatura,
  tendenciaTemperatura,
} from './temperatureUnit';

const MS_HORA = 60 * 60 * 1000;

/** Fecha guía del registro: `created_at` o, si falta, `fecha`. */
export function fechaRegistroHistorial(row: DatoOficialHistorial): string | null {
  const v = row.created_at ?? row.fecha ?? null;
  if (v == null || v === '') return null;
  return v;
}

export function timestampRegistroHistorial(row: DatoOficialHistorial): number {
  const v = fechaRegistroHistorial(row);
  if (v == null) return NaN;
  return parseTelemetryTimestampClient(v);
}

function compararPorFechaAsc(a: DatoOficialHistorial, b: DatoOficialHistorial): number {
  const ta = timestampRegistroHistorial(a);
  const tb = timestampRegistroHistorial(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

function compararPorFechaDesc(a: DatoOficialHistorial, b: DatoOficialHistorial): number {
  return -compararPorFechaAsc(a, b);
}

/**
 * Filtra registros con fecha guía dentro de las últimas `horas` respecto a `referencia`,
 * ordenados cronológicamente (más antiguo primero) para series temporales.
 */
export function filtrarDatosUltimasHoras(
  datos: DatoOficialHistorial[],
  horas: number,
  referencia: Date = new Date()
): DatoOficialHistorial[] {
  const desde = referencia.getTime() - horas * MS_HORA;
  const hasta = referencia.getTime();
  return datos
    .filter((row) => {
      const t = timestampRegistroHistorial(row);
      return !Number.isNaN(t) && t >= desde && t <= hasta;
    })
    .sort(compararPorFechaAsc);
}

/** Filtra por ventana [desdeMs, hastaMs] (instantes absolutos). */
export function filtrarDatosPorRangoMs(
  datos: DatoOficialHistorial[],
  desdeMs: number,
  hastaMs: number
): DatoOficialHistorial[] {
  return datos
    .filter((row) => {
      const t = timestampRegistroHistorial(row);
      return !Number.isNaN(t) && t >= desdeMs && t <= hastaMs;
    })
    .sort(compararPorFechaAsc);
}

/** ¿Los datos cargados cubren el rango pedido? (con holgura de 2 min). */
export function datosCubrenRangoMs(
  datos: DatoOficialHistorial[],
  desdeMs: number,
  hastaMs: number,
  holguraMs = 2 * 60 * 1000
): boolean {
  if (!datos.length) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const row of datos) {
    const t = timestampRegistroHistorial(row);
    if (Number.isNaN(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  return min <= desdeMs + holguraMs && max >= hastaMs - holguraMs;
}

/** Orden más reciente primero (tabla). */
export function ordenarTablaDesc(datos: DatoOficialHistorial[]): DatoOficialHistorial[] {
  return [...datos].sort(compararPorFechaDesc);
}

export interface HistorialChartRow {
  /** Etiqueta eje X */
  label: string;
  /** Marca temporal (ms) para tooltip */
  ts: number;
  setTemperatura: number | null;
  suministro: number | null;
  retorno: number | null;
  evaporador: number | null;
  ambiente: number | null;
  humedad: number | null;
  usda1: number | null;
  usda2: number | null;
  usda3: number | null;
  usda4: number | null;
}

export function datosAGrafica(
  datos: DatoOficialHistorial[],
  zonaHoraria?: string | null
): HistorialChartRow[] {
  const display = resolveDisplayTimeZone(zonaHoraria);
  const sorted = [...datos].sort(compararPorFechaAsc);
  return sorted
    .map((row) => {
      const raw = fechaRegistroHistorial(row);
      if (raw == null) return null;
      const ts = parseTelemetryTimestampClient(raw);
      if (Number.isNaN(ts)) return null;
      return {
        label: formatDateTimeInTz(raw, display.iana),
        ts,
        setTemperatura: num(row.set_point),
        suministro: num(row.temp_supply_1),
        retorno: num(row.return_air),
        evaporador: num(row.evaporation_coil),
        ambiente: num(row.ambient_air),
        humedad: num(row.relative_humidity),
        usda1: cargoTempValida(row.cargo_1_temp),
        usda2: cargoTempValida(row.cargo_2_temp),
        usda3: cargoTempValida(row.cargo_3_temp),
        usda4: cargoTempValida(row.cargo_4_temp),
      };
    })
    .filter((r): r is HistorialChartRow => r != null);
}

function num(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

export const TABLA_HISTORIAL_COLUMNAS: {
  key: keyof DatoOficialHistorial | 'fecha_registro';
  header: string;
  /** Columna de temperatura (aplica unidad °C/°F). */
  esTemperatura?: boolean;
  /** Mostrar flecha de tendencia vs muestra anterior. */
  conTendencia?: boolean;
}[] = [
  { key: 'fecha_registro', header: 'Fecha' },
  { key: 'set_point', header: 'Set', esTemperatura: true },
  { key: 'temp_supply_1', header: 'Suministro', esTemperatura: true, conTendencia: true },
  { key: 'return_air', header: 'Retorno', esTemperatura: true, conTendencia: true },
  { key: 'evaporation_coil', header: 'Evaporador', esTemperatura: true },
  { key: 'ambient_air', header: 'Aire ambiente', esTemperatura: true },
  { key: 'cargo_1_temp', header: 'USDA1', esTemperatura: true },
  { key: 'cargo_2_temp', header: 'USDA2', esTemperatura: true },
  { key: 'cargo_3_temp', header: 'USDA3', esTemperatura: true },
  { key: 'cargo_4_temp', header: 'USDA4', esTemperatura: true },
  { key: 'line_voltage', header: 'Voltaje línea' },
  { key: 'line_frequency', header: 'Frecuencia línea' },
  { key: 'consumption_ph_1', header: 'Consumo fase 1' },
  { key: 'consumption_ph_2', header: 'Consumo fase 2' },
  { key: 'consumption_ph_3', header: 'Consumo fase 3' },
  { key: 'relative_humidity', header: 'Humedad relativa' },
];

export function celdaHistorial(
  row: DatoOficialHistorial,
  key: keyof DatoOficialHistorial | 'fecha_registro',
  zonaHoraria?: string | null,
  opts?: { unidad?: import('./temperatureUnit').TemperaturaUnidad }
): string {
  const unidad = opts?.unidad ?? 'C';
  if (key === 'fecha_registro') {
    const raw = fechaRegistroHistorial(row);
    if (raw == null) return '—';
    const display = resolveDisplayTimeZone(zonaHoraria);
    return formatDateTimeInTz(raw, display.iana);
  }

  const v = row[key as keyof DatoOficialHistorial];
  if (
    key === 'cargo_1_temp' ||
    key === 'cargo_2_temp' ||
    key === 'cargo_3_temp' ||
    key === 'cargo_4_temp'
  ) {
    const n = cargoTempValida(v as number | null | undefined);
    if (n == null) return 'NA';
    return formatTemperatura(n, unidad);
  }

  const col = TABLA_HISTORIAL_COLUMNAS.find((c) => c.key === key);
  if (col?.esTemperatura) {
    return formatTemperatura(v as number | null | undefined, unidad);
  }

  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '—';
  return String(v);
}

/**
 * Tabla ordenada más reciente primero: tendencia = valor actual vs la fila siguiente
 * (muestra más antigua).
 */
export function tendenciaEnTablaDesc(
  filasDesc: DatoOficialHistorial[],
  index: number,
  key: 'return_air' | 'temp_supply_1'
): import('./temperatureUnit').TempTendencia {
  const actual = filasDesc[index]?.[key];
  const anterior = filasDesc[index + 1]?.[key];
  return tendenciaTemperatura(
    actual as number | null | undefined,
    anterior as number | null | undefined
  );
}

/** Carga 1–4: válido solo en [-30, 24]; fuera se considera nulo. */
export function cargoTempValida(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  if (v < -30 || v > 24) return null;
  return v;
}

/** @deprecated Preferir rangoUltimasHorasInTz + dateToDatetimeLocalInTz */
export function dateToDatetimeLocalValue(d: Date): string {
  const display = TELEMETRY_SOURCE_TZ;
  const p = (n: number) => String(n).padStart(2, '0');
  // Mantener firma; usa componentes en UTC+offset vía toLocale no disponible aquí
  // Dejamos conversión vía telemetryTimezone en el componente.
  void display;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** @deprecated Preferir rangoUltimasHorasInTz */
export function rangoUltimasHorasDatetimeLocal(horas: number): {
  desde: string;
  hasta: string;
} {
  const fin = new Date();
  const ini = new Date(fin.getTime() - horas * MS_HORA);
  return {
    desde: dateToDatetimeLocalValue(ini),
    hasta: dateToDatetimeLocalValue(fin),
  };
}

export function claveFilaHistorial(row: DatoOficialHistorial, index: number): string {
  const f = fechaRegistroHistorial(row);
  return f != null ? `${f}-${row.id ?? index}` : `sin-fecha-${row.id ?? index}`;
}

const MS_30MIN = 30 * 60 * 1000;

/**
 * Muestreo ~cada 30 min desde el último registro hacia atrás (trazabilidad 3h).
 * Devuelve filas más reciente primero, sin duplicar el mismo punto.
 */
export function muestrearHistorialCada30Min(
  datos: DatoOficialHistorial[],
  horas = 3,
  referencia: Date = new Date()
): DatoOficialHistorial[] {
  const ventana = filtrarDatosUltimasHoras(datos, horas, referencia);
  if (ventana.length === 0) return [];

  const sorted = ventana
    .map((row) => ({ row, ts: timestampRegistroHistorial(row) }))
    .filter(({ ts }) => !Number.isNaN(ts))
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return [];

  const cutoff = referencia.getTime() - horas * MS_HORA;
  const seen = new Set<number>();
  const out: DatoOficialHistorial[] = [];
  let targetTs = sorted[sorted.length - 1].ts;

  while (targetTs >= cutoff) {
    let best = sorted[0];
    let bestDiff = Math.abs(best.ts - targetTs);
    for (const item of sorted) {
      const diff = Math.abs(item.ts - targetTs);
      if (diff < bestDiff) {
        best = item;
        bestDiff = diff;
      }
    }
    if (!seen.has(best.ts)) {
      seen.add(best.ts);
      out.push(best.row);
    }
    targetTs -= MS_30MIN;
  }

  return out.sort((a, b) => timestampRegistroHistorial(b) - timestampRegistroHistorial(a));
}
