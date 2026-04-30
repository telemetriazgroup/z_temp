import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DatoOficialHistorial } from '../types';
import { TABLA_HISTORIAL_COLUMNAS, celdaHistorial, ordenarTablaDesc } from './historialOficial';

export interface HistorialExportRango {
  desde: Date;
  hasta: Date;
}

function p2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fragmento seguro para nombre de archivo (sin dos puntos ni espacios). */
function slugRangoParaArchivo(desde: Date, hasta: Date): string {
  const u = (d: Date) =>
    `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return `${u(desde)}_a_${u(hasta)}`;
}

function nombreBaseArchivo(imei: string, rango: HistorialExportRango): string {
  return `historial_${imei}_${slugRangoParaArchivo(rango.desde, rango.hasta)}`;
}

function filasExport(
  datos: DatoOficialHistorial[]
): { headers: string[]; rows: string[][] } {
  const headers = TABLA_HISTORIAL_COLUMNAS.map((c) => c.header);
  const rows = ordenarTablaDesc(datos).map((row) =>
    TABLA_HISTORIAL_COLUMNAS.map((c) => celdaHistorial(row, c.key))
  );
  return { headers, rows };
}

/** No revocar el blob en el mismo tick: en algunos navegadores cancela la descarga. */
function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function exportHistorialCsv(
  datos: DatoOficialHistorial[],
  imei: string,
  rango: HistorialExportRango
): void {
  const { headers, rows } = filasExport(datos);
  const sep = ';';
  const escape = (s: string) =>
    /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const body = [
    headers.map(escape).join(sep),
    ...rows.map((r) => r.map(escape).join(sep)),
  ].join('\r\n');
  const meta =
    `${escape('IMEI')}${sep}${escape(imei)}\r\n` +
    `${escape('Rango desde')}${sep}${escape(rango.desde.toLocaleString('es-ES'))}\r\n` +
    `${escape('Rango hasta')}${sep}${escape(rango.hasta.toLocaleString('es-ES'))}\r\n` +
    `${escape('Nota')}${sep}${escape('Primera columna de datos: fecha de registro (created_at)')}\r\n` +
    `\r\n`;
  const bom = '\uFEFF';
  descargarBlob(
    `${nombreBaseArchivo(imei, rango)}.csv`,
    new Blob([bom + meta + body], { type: 'text/csv;charset=utf-8' })
  );
}

export function exportHistorialXlsx(
  datos: DatoOficialHistorial[],
  imei: string,
  rango: HistorialExportRango
): void {
  const { headers, rows } = filasExport(datos);
  const meta: string[][] = [
    [`IMEI: ${imei}`],
    ['Fecha guía: la primera columna de la tabla es created_at (fecha de registro).'],
    [`Desde: ${rango.desde.toLocaleString('es-ES')}`],
    [`Hasta: ${rango.hasta.toLocaleString('es-ES')}`],
    [],
  ];
  const aoa: (string | number)[][] = [...meta, headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${nombreBaseArchivo(imei, rango)}.xlsx`);
}

export function exportHistorialPdf(
  datos: DatoOficialHistorial[],
  imei: string,
  rango: HistorialExportRango
): void {
  const { headers, rows } = filasExport(datos);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(11);
  doc.text(`Historial oficial · IMEI ${imei}`, 14, 10);
  doc.setFontSize(8);
  doc.text(
    `Rango (fecha guía): ${rango.desde.toLocaleString('es-ES')} — ${rango.hasta.toLocaleString('es-ES')}`,
    14,
    15
  );
  doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 14, 19);
  doc.text('Primera columna de la tabla: fecha de registro (created_at).', 14, 23);
  autoTable(doc, {
    startY: 26,
    head: [headers],
    body: rows,
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [55, 65, 81] },
    margin: { left: 10, right: 10 },
  });
  doc.save(`${nombreBaseArchivo(imei, rango)}.pdf`);
}
