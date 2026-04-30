import type { DatoOficialHistorial } from '../types';

/** Ventanas de promedio cuando SUP/RET no están en banda ±10% del setpoint. */
export const REPORTE_SLOTS = [0, 4, 8, 12, 16, 20] as const;
export type ReporteSlotHour = (typeof REPORTE_SLOTS)[number];

export function ventanaPromedioSlot(slot: ReporteSlotHour): { desdeH: number; hastaH: number } {
  switch (slot) {
    case 0:
      return { desdeH: 1, hastaH: 3 };
    case 4:
      return { desdeH: 4, hastaH: 7 };
    case 8:
      return { desdeH: 8, hastaH: 11 };
    case 12:
      return { desdeH: 12, hastaH: 15 };
    case 16:
      return { desdeH: 16, hastaH: 19 };
    case 20:
      return { desdeH: 20, hastaH: 23 };
  }
}

function mismoDiaLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function lecturasDelDia(
  datos: DatoOficialHistorial[],
  dia: Date
): DatoOficialHistorial[] {
  return datos.filter((r) => mismoDiaLocal(new Date(r.created_at), dia));
}

/** Días inclusivos entre inicio y fin (solo fecha local). */
export function cadaDiaEntre(inicio: Date, fin: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const end = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
  while (d.getTime() <= end.getTime()) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function toleranciaSetpoint(setPoint: number): number {
  if (setPoint === 0 || Number.isNaN(setPoint)) return 0.5;
  return Math.abs(setPoint) * 0.1;
}

export function enBandaSetpoint(
  valor: number | null | undefined,
  setPoint: number
): boolean {
  if (valor == null || Number.isNaN(valor)) return false;
  const t = toleranciaSetpoint(setPoint);
  return valor >= setPoint - t && valor <= setPoint + t;
}

export function supRetEnBanda(
  sup: number | null | undefined,
  ret: number | null | undefined,
  setPoint: number
): boolean {
  return enBandaSetpoint(sup, setPoint) && enBandaSetpoint(ret, setPoint);
}

export function puntoMasCercano(
  lecturasDia: DatoOficialHistorial[],
  dia: Date,
  hora: number
): DatoOficialHistorial | null {
  if (lecturasDia.length === 0) return null;
  const objetivo = new Date(
    dia.getFullYear(),
    dia.getMonth(),
    dia.getDate(),
    hora,
    0,
    0,
    0
  ).getTime();
  let mejor: DatoOficialHistorial | null = null;
  let mejorDelta = Infinity;
  for (const r of lecturasDia) {
    const t = new Date(r.created_at).getTime();
    const delta = Math.abs(t - objetivo);
    if (delta < mejorDelta) {
      mejorDelta = delta;
      mejor = r;
    }
  }
  return mejor;
}

export function promediarSupRetEnVentanaHoraria(
  lecturasDia: DatoOficialHistorial[],
  dia: Date,
  desdeH: number,
  hastaH: number
): { sup: number | null; ret: number | null } {
  const muestras = lecturasDia.filter((r) => {
    const d = new Date(r.created_at);
    if (!mismoDiaLocal(d, dia)) return false;
    const h = d.getHours();
    return h >= desdeH && h <= hastaH;
  });
  const sups = muestras
    .map((s) => s.temp_supply_1)
    .filter((x): x is number => x != null && !Number.isNaN(x));
  const rets = muestras
    .map((s) => s.return_air)
    .filter((x): x is number => x != null && !Number.isNaN(x));
  return {
    sup: sups.length ? sups.reduce((a, b) => a + b, 0) / sups.length : null,
    ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
  };
}

function setPointDelDia(
  lecturasDia: DatoOficialHistorial[],
  dia: Date
): number | null {
  const c0 = puntoMasCercano(lecturasDia, dia, 0);
  if (c0?.set_point != null && !Number.isNaN(c0.set_point)) return c0.set_point;
  const conSp = lecturasDia.find(
    (r) => r.set_point != null && !Number.isNaN(r.set_point)
  );
  return conSp?.set_point ?? null;
}

export interface ReporteInternoCeldaSlot {
  sup: number | null;
  ret: number | null;
  usoPromedio: boolean;
}

export interface ReporteInternoFila {
  n: number;
  fecha: Date;
  /** dd/mm/yyyy */
  fechaFmt: string;
  contenedor: string;
  producto: string;
  ubc: string;
  setPoint: number | null;
  setPointFmt: string;
  celdas: ReporteInternoCeldaSlot[];
  observaciones: string;
}

function fmtFechaCorta(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function resolverCelda(
  dia: Date,
  slot: ReporteSlotHour,
  lecturasDia: DatoOficialHistorial[],
  setPoint: number | null
): ReporteInternoCeldaSlot {
  const cercano = puntoMasCercano(lecturasDia, dia, slot);
  let sup = cercano?.temp_supply_1 ?? null;
  let ret = cercano?.return_air ?? null;
  if (sup != null && Number.isNaN(sup)) sup = null;
  if (ret != null && Number.isNaN(ret)) ret = null;

  if (setPoint == null) {
    return { sup, ret, usoPromedio: false };
  }

  if (supRetEnBanda(sup, ret, setPoint)) {
    return { sup, ret, usoPromedio: false };
  }

  const { desdeH, hastaH } = ventanaPromedioSlot(slot);
  const prom = promediarSupRetEnVentanaHoraria(lecturasDia, dia, desdeH, hastaH);
  if (prom.sup != null || prom.ret != null) {
    return {
      sup: prom.sup ?? sup,
      ret: prom.ret ?? ret,
      usoPromedio: true,
    };
  }

  return { sup, ret, usoPromedio: false };
}

export function generarReporteInterno(
  datos: DatoOficialHistorial[],
  dias: Date[],
  contenedor: string,
  producto: string,
  ubc: string
): ReporteInternoFila[] {
  return dias.map((dia, idx) => {
    const ld = lecturasDelDia(datos, dia);
    const sp = setPointDelDia(ld, dia);
    const celdas: ReporteInternoCeldaSlot[] = REPORTE_SLOTS.map((slot) =>
      resolverCelda(dia, slot, ld, sp)
    );

    return {
      n: idx + 1,
      fecha: dia,
      fechaFmt: fmtFechaCorta(dia),
      contenedor,
      producto,
      ubc,
      setPoint: sp,
      setPointFmt: sp == null ? '—' : `${sp}°C`,
      celdas,
      observaciones: 'SIN OBSERVACIONES',
    };
  });
}
