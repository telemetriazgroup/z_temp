import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DatoOficialHistorial } from '../types';
import { TABLA_HISTORIAL_COLUMNAS, celdaHistorial, ordenarTablaDesc } from './historialOficial';
import { downloadJsonFile } from './downloadJson';
import {
  formatDateTimeInTz,
  resolveDisplayTimeZone,
} from './telemetryTimezone';

export interface HistorialExportRango {
  desde: Date;
  hasta: Date;
}

function p2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fragmento seguro para nombre de archivo (sin dos puntos ni espacios). */
function slugRangoParaArchivo(desde: Date, hasta: Date, iana: string): string {
  const u = (d: Date) => {
    const s = formatDateTimeInTz(d, iana, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    // es-PE → dd/mm/yyyy, hh:mm:ss → slug
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[3]}${m[2]}${m[1]}T${m[4]}${m[5]}${m[6]}`;
    return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
  };
  return `${u(desde)}_a_${u(hasta)}`;
}

function nombreBaseArchivo(
  imei: string,
  rango: HistorialExportRango,
  zonaHoraria?: string | null
): string {
  const iana = resolveDisplayTimeZone(zonaHoraria).iana;
  return `historial_${imei}_${slugRangoParaArchivo(rango.desde, rango.hasta, iana)}`;
}

function fmtRango(
  d: Date,
  zonaHoraria?: string | null
): string {
  return formatDateTimeInTz(d, resolveDisplayTimeZone(zonaHoraria).iana);
}

function filasExport(
  datos: DatoOficialHistorial[],
  zonaHoraria?: string | null
): { headers: string[]; rows: string[][] } {
  const headers = TABLA_HISTORIAL_COLUMNAS.map((c) => c.header);
  const rows = ordenarTablaDesc(datos).map((row) =>
    TABLA_HISTORIAL_COLUMNAS.map((c) => celdaHistorial(row, c.key, zonaHoraria))
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
  codigo: string,
  rango: HistorialExportRango,
  zonaHoraria?: string | null
): void {
  const { headers, rows } = filasExport(datos, zonaHoraria);
  const tz = resolveDisplayTimeZone(zonaHoraria);
  const sep = ';';
  const escape = (s: string) =>
    /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const body = [
    headers.map(escape).join(sep),
    ...rows.map((r) => r.map(escape).join(sep)),
  ].join('\r\n');
  const meta =
    `${escape('IMEI')}${sep}${escape(imei)}\r\n` +
    `${escape('Código')}${sep}${escape(codigo)}\r\n` +
    `${escape('Zona')}${sep}${escape(tz.label)}\r\n` +
    `${escape('Rango desde')}${sep}${escape(fmtRango(rango.desde, zonaHoraria))}\r\n` +
    `${escape('Rango hasta')}${sep}${escape(fmtRango(rango.hasta, zonaHoraria))}\r\n` +
    `${escape('Nota')}${sep}${escape('Primera columna: fecha (created_at o fecha si falta created_at)')}\r\n` +
    `\r\n`;
  const bom = '\uFEFF';
  descargarBlob(
    `${nombreBaseArchivo(imei, rango, zonaHoraria)}.csv`,
    new Blob([bom + meta + body], { type: 'text/csv;charset=utf-8' })
  );
}

export function exportHistorialXlsx(
  datos: DatoOficialHistorial[],
  imei: string,
  codigo: string,
  rango: HistorialExportRango,
  zonaHoraria?: string | null
): void {
  const { headers, rows } = filasExport(datos, zonaHoraria);
  const tz = resolveDisplayTimeZone(zonaHoraria);
  const meta: string[][] = [
    [`IMEI: ${imei}`],
    [`Código: ${codigo}`],
    [`Zona: ${tz.label}`],
    ['Fecha guía: created_at o, si no viene, el campo fecha.'],
    [`Desde: ${fmtRango(rango.desde, zonaHoraria)}`],
    [`Hasta: ${fmtRango(rango.hasta, zonaHoraria)}`],
    [],
  ];
  const aoa: (string | number)[][] = [...meta, headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${nombreBaseArchivo(imei, rango, zonaHoraria)}.xlsx`);
}

export function exportHistorialPdf(
  datos: DatoOficialHistorial[],
  imei: string,
  codigo: string,
  nombreContenedor: string,
  rango: HistorialExportRango,
  zonaHoraria?: string | null
): void {
  const { headers, rows } = filasExport(datos, zonaHoraria);
  const tz = resolveDisplayTimeZone(zonaHoraria);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(11);
  doc.text(
    `Historial oficial · ${nombreContenedor} · IMEI ${imei} (${codigo})`,
    14,
    10
  );
  doc.setFontSize(8);
  doc.text(
    `Rango (${tz.label}): ${fmtRango(rango.desde, zonaHoraria)} — ${fmtRango(rango.hasta, zonaHoraria)}`,
    14,
    15
  );
  doc.text(`Generado: ${fmtRango(new Date(), zonaHoraria)}`, 14, 19);
  doc.text('Primera columna: fecha (created_at o fecha).', 14, 23);
  autoTable(doc, {
    startY: 26,
    head: [headers],
    body: rows,
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [55, 65, 81] },
    margin: { left: 10, right: 10 },
  });
  doc.save(`${nombreBaseArchivo(imei, rango, zonaHoraria)}.pdf`);
}

export function exportHistorialJson(
  datos: DatoOficialHistorial[],
  imei: string,
  codigo: string,
  rango: HistorialExportRango,
  zonaHoraria?: string | null
): void {
  const tz = resolveDisplayTimeZone(zonaHoraria);
  downloadJsonFile(`${nombreBaseArchivo(imei, rango, zonaHoraria)}.json`, {
    exportedAt: new Date().toISOString(),
    imei,
    codigo,
    zonaHoraria: tz.label,
    rango: {
      desde: rango.desde.toISOString(),
      hasta: rango.hasta.toISOString(),
      desdeLocal: fmtRango(rango.desde, zonaHoraria),
      hastaLocal: fmtRango(rango.hasta, zonaHoraria),
    },
    totalRegistros: datos.length,
    datos: ordenarTablaDesc(datos),
  });
}
