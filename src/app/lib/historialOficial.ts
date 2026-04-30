import type { DatoOficialHistorial } from '../types';

const MS_HORA = 60 * 60 * 1000;

/**
 * Filtra registros con `created_at` dentro de las últimas `horas` respecto a `referencia`,
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
      const t = new Date(row.created_at).getTime();
      return !Number.isNaN(t) && t >= desde && t <= hasta;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
}

/** Orden más reciente primero (tabla). */
export function ordenarTablaDesc(
  datos: DatoOficialHistorial[]
): DatoOficialHistorial[] {
  return [...datos].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
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
}

export function datosAGrafica(datos: DatoOficialHistorial[]): HistorialChartRow[] {
  const sorted = [...datos].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return sorted.map((row) => {
    const d = new Date(row.created_at);
    return {
      label: d.toLocaleString('es-ES', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      ts: d.getTime(),
      setTemperatura: num(row.set_point),
      suministro: num(row.temp_supply_1),
      retorno: num(row.return_air),
      evaporador: num(row.evaporation_coil),
    };
  });
}

function num(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

export const TABLA_HISTORIAL_COLUMNAS: {
  key: keyof DatoOficialHistorial;
  header: string;
}[] = [
  { key: 'created_at', header: 'Fecha (registro)' },
  { key: 'set_point', header: 'Set temperatura' },
  { key: 'temp_supply_1', header: 'Suministro' },
  { key: 'return_air', header: 'Retorno' },
  { key: 'evaporation_coil', header: 'Evaporador' },
  { key: 'ambient_air', header: 'Aire ambiente' },
  { key: 'cargo_1_temp', header: 'Carga 1' },
  { key: 'cargo_2_temp', header: 'Carga 2' },
  { key: 'cargo_3_temp', header: 'Carga 3' },
  { key: 'cargo_4_temp', header: 'Carga 4' },
  { key: 'line_voltage', header: 'Voltaje línea' },
  { key: 'line_frequency', header: 'Frecuencia línea' },
  { key: 'consumption_ph_1', header: 'Consumo fase 1' },
  { key: 'consumption_ph_2', header: 'Consumo fase 2' },
  { key: 'consumption_ph_3', header: 'Consumo fase 3' },
  { key: 'relative_humidity', header: 'Humedad relativa' },
];

export function celdaHistorial(
  row: DatoOficialHistorial,
  key: keyof DatoOficialHistorial
): string {
  const v = row[key];
  if (key === 'created_at' && typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('es-ES');
  }
  if (
    key === 'cargo_1_temp' ||
    key === 'cargo_2_temp' ||
    key === 'cargo_3_temp' ||
    key === 'cargo_4_temp'
  ) {
    const n = cargoTempValida(v as number | null | undefined);
    return n == null ? 'Nulo' : String(n);
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
