import type { DatoOficialHistorial } from '../types';

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
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? NaN : t;
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
  /** USDA1 ← cargo_1_temp */
  usda1: number | null;
  /** USDA2 ← cargo_2_temp */
  usda2: number | null;
  /** USDA3 ← cargo_3_temp */
  usda3: number | null;
  /** USDA4 ← cargo_4_temp */
  usda4: number | null;
}

export function datosAGrafica(datos: DatoOficialHistorial[]): HistorialChartRow[] {
  const sorted = [...datos].sort(compararPorFechaAsc);
  return sorted
    .map((row) => {
      const raw = fechaRegistroHistorial(row);
      if (raw == null) return null;
      const d = new Date(raw);
      const ts = d.getTime();
      if (Number.isNaN(ts)) return null;
      return {
        label: d.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
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
}[] = [
  { key: 'fecha_registro', header: 'Fecha' },
  { key: 'set_point', header: 'Set temperatura' },
  { key: 'temp_supply_1', header: 'Suministro' },
  { key: 'return_air', header: 'Retorno' },
  { key: 'evaporation_coil', header: 'Evaporador' },
  { key: 'ambient_air', header: 'Aire ambiente' },
  { key: 'cargo_1_temp', header: 'USDA1' },
  { key: 'cargo_2_temp', header: 'USDA2' },
  { key: 'cargo_3_temp', header: 'USDA3' },
  { key: 'cargo_4_temp', header: 'USDA4' },
  { key: 'line_voltage', header: 'Voltaje línea' },
  { key: 'line_frequency', header: 'Frecuencia línea' },
  { key: 'consumption_ph_1', header: 'Consumo fase 1' },
  { key: 'consumption_ph_2', header: 'Consumo fase 2' },
  { key: 'consumption_ph_3', header: 'Consumo fase 3' },
  { key: 'relative_humidity', header: 'Humedad relativa' },
];

export function celdaHistorial(
  row: DatoOficialHistorial,
  key: keyof DatoOficialHistorial | 'fecha_registro'
): string {
  if (key === 'fecha_registro') {
    const raw = fechaRegistroHistorial(row);
    if (raw == null) return '—';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleString('es-ES');
  }

  const v = row[key as keyof DatoOficialHistorial];
  if (
    key === 'cargo_1_temp' ||
    key === 'cargo_2_temp' ||
    key === 'cargo_3_temp' ||
    key === 'cargo_4_temp'
  ) {
    const n = cargoTempValida(v as number | null | undefined);
    return n == null ? 'NA' : String(n);
  }
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '—';
  return String(v);
}

/** Carga 1–4: válido solo en [-30, 24]; fuera se considera nulo. */
export function cargoTempValida(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  if (v < -30 || v > 24) return null;
  return v;
}

/** Valor para `<input type="datetime-local" step="1" />` en hora local. */
export function dateToDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Rango por defecto: últimas `horas` (para precargar búsqueda). */
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
