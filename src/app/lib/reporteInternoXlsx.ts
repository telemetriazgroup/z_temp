import * as XLSX from 'xlsx';
import { REPORTE_SLOTS, type ReporteInternoFila } from './reporteInterno';

function fmtTemp(v: number | null): string {
  return v != null && !Number.isNaN(v) ? v.toFixed(1) : '—';
}

function buildHeaders(): string[] {
  const base = ['N', 'FECHA', 'CONTENEDOR', 'PRODUCTO', 'UBC', 'S.P.'];
  const slots: string[] = [];
  for (const h of REPORTE_SLOTS) {
    const label = `${String(h).padStart(2, '0')}:00 Hrs`;
    slots.push(`${label} SUP`, `${label} RET`);
  }
  return [...base, ...slots, 'OBSERVACIONES'];
}

function filaToRow(f: ReporteInternoFila): (string | number)[] {
  const row: (string | number)[] = [
    f.n,
    f.fechaFmt,
    f.contenedor,
    f.producto,
    f.ubc,
    f.setPointFmt,
  ];
  for (const c of f.celdas) {
    row.push(fmtTemp(c.sup), fmtTemp(c.ret));
  }
  row.push(f.observaciones);
  return row;
}

export function descargarXlsxReporteInterno(
  filas: ReporteInternoFila[],
  tituloExtra: string
): void {
  const headers = buildHeaders();
  const meta: (string | number)[][] = [
    ['Reporte interno'],
    [tituloExtra],
    [`Generado: ${new Date().toLocaleString('es-ES')}`],
    [],
  ];
  const aoa: (string | number)[][] = [...meta, headers, ...filas.map(filaToRow)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const safe = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  XLSX.writeFile(wb, `reporte_interno_${safe}.xlsx`);
}
