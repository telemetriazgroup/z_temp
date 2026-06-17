import type { DatoOficialHistorial } from '../types';
import { fechaRegistroHistorial, timestampRegistroHistorial } from './historialOficial';
import { nivelCo2O2Valido } from './telemetriaDetalle';

/** Tolerancia alrededor del setpoint (alineado con control_logica_tunel co2Pct). */
export const TOLERANCIA_GAS_CA = 0.25;

export const SECTOR_GASES_META = {
  inicio: {
    titulo: 'Sector 1 — Lectura inicial',
    color: '#94a3b8',
  },
  reduccion_o2: {
    titulo: 'Sector 2 — Reducción de oxígeno',
    color: '#0ea5e9',
  },
  incremento_co2: {
    titulo: 'Sector 3 — Incremento de CO₂',
    color: '#f59e0b',
  },
  estabilizacion: {
    titulo: 'Sector 4 — Estabilización',
    color: '#10b981',
  },
} as const;

export type SectorGasesId = keyof typeof SECTOR_GASES_META;

export interface PuntoGasesCa {
  ts: number;
  label: string;
  o2: number | null;
  co2: number | null;
  setO2: number | null;
  setCo2: number | null;
  sectorId: SectorGasesId;
}

export interface SectorGasesAnalisis {
  id: SectorGasesId;
  titulo: string;
  color: string;
  desde: Date;
  hasta: Date;
  o2Inicio: number | null;
  o2Fin: number | null;
  co2Inicio: number | null;
  co2Fin: number | null;
  duracionMin: number;
  analisis: string;
}

export interface ReporteCaSeccion31 {
  setpointO2: number | null;
  setpointCo2: number | null;
  inicio: Date | null;
  estabilizacion: Date | null;
  duracionEstabilizacionMin: number | null;
  puntos: PuntoGasesCa[];
  sectores: SectorGasesAnalisis[];
  resumen: string;
  sinDatosGases: boolean;
}

function fmtHora(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function enBandaGas(valor: number | null, objetivo: number | null, tol = TOLERANCIA_GAS_CA): boolean {
  if (valor == null || objetivo == null) return false;
  return Math.abs(valor - objetivo) <= tol;
}

function primerSetpoint(
  puntos: { setO2: number | null; setCo2: number | null }[],
  key: 'setO2' | 'setCo2'
): number | null {
  for (const p of puntos) {
    const v = p[key];
    if (v != null && !Number.isNaN(v)) return v;
  }
  return null;
}

function ultimoValorEnRango(
  puntos: PuntoGasesCa[],
  desde: number,
  hasta: number,
  key: 'o2' | 'co2'
): number | null {
  const slice = puntos.filter((p) => p.ts >= desde && p.ts <= hasta);
  for (let i = slice.length - 1; i >= 0; i--) {
    const v = slice[i][key];
    if (v != null) return v;
  }
  return null;
}

function primerValorEnRango(
  puntos: PuntoGasesCa[],
  desde: number,
  hasta: number,
  key: 'o2' | 'co2'
): number | null {
  const slice = puntos.filter((p) => p.ts >= desde && p.ts <= hasta);
  for (const p of slice) {
    const v = p[key];
    if (v != null) return v;
  }
  return null;
}

function analisisSector(
  id: SectorGasesId,
  o2Ini: number | null,
  o2Fin: number | null,
  co2Ini: number | null,
  co2Fin: number | null,
  setO2: number | null,
  setCo2: number | null
): string {
  switch (id) {
    case 'inicio':
      return `Lectura de arranque con O₂ ${o2Ini ?? '—'} % y CO₂ ${co2Ini ?? '—'} %. Objetivos iniciales: O₂ ${setO2 ?? '—'} %, CO₂ ${setCo2 ?? '—'} %.`;
    case 'reduccion_o2': {
      const delta = o2Ini != null && o2Fin != null ? (o2Fin - o2Ini).toFixed(1) : '—';
      const enRango = setO2 != null && o2Fin != null && enBandaGas(o2Fin, setO2);
      return `El oxígeno descendió ${delta} puntos porcentuales${enRango ? ' y alcanzó la banda del setpoint' : ', acercándose al objetivo'}.`;
    }
    case 'incremento_co2': {
      const delta = co2Ini != null && co2Fin != null ? (co2Fin - co2Ini).toFixed(1) : '—';
      const enRango = setCo2 != null && co2Fin != null && enBandaGas(co2Fin, setCo2);
      return `El CO₂ aumentó ${delta} puntos porcentuales${enRango ? ' hasta entrar en la banda objetivo' : ' en fase de ajuste'}.`;
    }
    case 'estabilizacion':
      return `O₂ y CO₂ se mantienen en torno a los setpoints (${setO2 ?? '—'} % / ${setCo2 ?? '—'} % con ±${TOLERANCIA_GAS_CA} %). Proceso estabilizado.`;
  }
}

function detectarEstabilizacion(
  raw: PuntoGasesCa[],
  setO2: number | null,
  setCo2: number | null
): number | null {
  const minConsecutivos = 3;
  for (let i = 0; i < raw.length; i++) {
    let ok = true;
    for (let j = i; j < Math.min(i + minConsecutivos, raw.length); j++) {
      const p = raw[j];
      const o2Ok = setO2 == null || enBandaGas(p.o2, setO2);
      const co2Ok = setCo2 == null || enBandaGas(p.co2, setCo2);
      if (!o2Ok || !co2Ok) {
        ok = false;
        break;
      }
    }
    if (ok && i + minConsecutivos <= raw.length) return raw[i + minConsecutivos - 1].ts;
  }
  return raw.length > 0 ? raw[raw.length - 1].ts : null;
}

function asignarSectores(
  raw: PuntoGasesCa[],
  setO2: number | null,
  setCo2: number | null,
  finTs: number
): PuntoGasesCa[] {
  if (raw.length === 0) return [];

  const t0 = raw[0].ts;
  let tFinReduccionO2 = t0;
  let tFinIncrementoCo2 = t0;

  for (const p of raw) {
    if (p.ts > finTs) break;
    if (setO2 != null && p.o2 != null && enBandaGas(p.o2, setO2)) {
      tFinReduccionO2 = p.ts;
      break;
    }
    tFinReduccionO2 = p.ts;
  }

  for (const p of raw) {
    if (p.ts <= tFinReduccionO2 || p.ts > finTs) continue;
    if (setCo2 != null && p.co2 != null && enBandaGas(p.co2, setCo2)) {
      tFinIncrementoCo2 = p.ts;
      break;
    }
    tFinIncrementoCo2 = p.ts;
  }

  const tInicioFin = Math.min(tFinReduccionO2, raw[0].ts + 15 * 60 * 1000);

  return raw.map((p) => {
    if (p.ts > finTs) return { ...p, sectorId: 'estabilizacion' as const };
    if (p.ts <= tInicioFin) return { ...p, sectorId: 'inicio' as const };
    if (p.ts <= tFinReduccionO2) return { ...p, sectorId: 'reduccion_o2' as const };
    if (p.ts <= tFinIncrementoCo2) return { ...p, sectorId: 'incremento_co2' as const };
    return { ...p, sectorId: 'estabilizacion' as const };
  });
}

function buildSectoresAnalisis(
  puntos: PuntoGasesCa[],
  finTs: number,
  setO2: number | null,
  setCo2: number | null
): SectorGasesAnalisis[] {
  const ids: SectorGasesId[] = ['inicio', 'reduccion_o2', 'incremento_co2', 'estabilizacion'];
  const out: SectorGasesAnalisis[] = [];

  for (const id of ids) {
    const slice = puntos.filter((p) => p.sectorId === id && p.ts <= finTs);
    if (slice.length === 0) continue;
    const desde = new Date(slice[0].ts);
    const hasta = new Date(slice[slice.length - 1].ts);
    const o2Ini = primerValorEnRango(puntos, slice[0].ts, slice[slice.length - 1].ts, 'o2');
    const o2Fin = ultimoValorEnRango(puntos, slice[0].ts, slice[slice.length - 1].ts, 'o2');
    const co2Ini = primerValorEnRango(puntos, slice[0].ts, slice[slice.length - 1].ts, 'co2');
    const co2Fin = ultimoValorEnRango(puntos, slice[0].ts, slice[slice.length - 1].ts, 'co2');

    out.push({
      id,
      titulo: SECTOR_GASES_META[id].titulo,
      color: SECTOR_GASES_META[id].color,
      desde,
      hasta,
      o2Inicio: o2Ini,
      o2Fin: o2Fin,
      co2Inicio: co2Ini,
      co2Fin: co2Fin,
      duracionMin: Math.round((hasta.getTime() - desde.getTime()) / 60000),
      analisis: analisisSector(id, o2Ini, o2Fin, co2Ini, co2Fin, setO2, setCo2),
    });
  }

  return out;
}

/** Construye sección 3.1 del reporte CA a partir del historial oficial. */
export function analizarSeccion31GasesEstabilizacion(
  datos: DatoOficialHistorial[]
): ReporteCaSeccion31 {
  const rawRows = [...datos]
    .map((row) => {
      const ts = timestampRegistroHistorial(row);
      const raw = fechaRegistroHistorial(row);
      if (raw == null || Number.isNaN(ts)) return null;
      const o2 = nivelCo2O2Valido(row.o2_reading);
      const co2 = nivelCo2O2Valido(row.co2_reading);
      const setO2 = nivelCo2O2Valido(row.set_point_o2);
      const setCo2 = nivelCo2O2Valido(row.set_point_co2);
      if (o2 == null && co2 == null) return null;
      const d = new Date(ts);
      return {
        ts,
        label: d.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        o2,
        co2,
        setO2,
        setCo2,
        sectorId: 'inicio' as SectorGasesId,
      };
    })
    .filter((p): p is PuntoGasesCa => p != null)
    .sort((a, b) => a.ts - b.ts);

  if (rawRows.length === 0) {
    return {
      setpointO2: null,
      setpointCo2: null,
      inicio: null,
      estabilizacion: null,
      duracionEstabilizacionMin: null,
      puntos: [],
      sectores: [],
      resumen: 'No hay lecturas de O₂/CO₂ en el rango seleccionado.',
      sinDatosGases: true,
    };
  }

  const setpointO2 = primerSetpoint(rawRows, 'setO2');
  const setpointCo2 = primerSetpoint(rawRows, 'setCo2');
  const finTs =
    detectarEstabilizacion(rawRows, setpointO2, setpointCo2) ??
    rawRows[rawRows.length - 1].ts;

  const puntos = asignarSectores(rawRows, setpointO2, setpointCo2, finTs).filter(
    (p) => p.ts <= finTs
  );
  const sectores = buildSectoresAnalisis(puntos, finTs, setpointO2, setpointCo2);
  const inicio = new Date(puntos[0].ts);
  const estabilizacion = new Date(finTs);
  const duracionEstabilizacionMin = Math.round((finTs - puntos[0].ts) / 60000);

  const resumen = `Desde ${fmtHora(inicio)} hasta estabilización ${fmtHora(estabilizacion)} (${duracionEstabilizacionMin} min). Setpoints iniciales: O₂ ${setpointO2 ?? '—'} %, CO₂ ${setpointCo2 ?? '—'} %.`;

  return {
    setpointO2,
    setpointCo2,
    inicio,
    estabilizacion,
    duracionEstabilizacionMin,
    puntos,
    sectores,
    resumen,
    sinDatosGases: false,
  };
}
