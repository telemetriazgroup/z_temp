import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REPORTE_SLOTS, type ReporteInternoFila } from './reporteInterno';

type HeadCell = string | { content: string; rowSpan?: number; colSpan?: number; styles?: { halign?: 'left' | 'center' | 'right' } };

export function descargarPdfReporteInterno(
  filas: ReporteInternoFila[],
  tituloExtra: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(12);
  doc.text('Reporte interno', 14, 12);
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(tituloExtra, 280);
  doc.text(lines, 14, 17);

  const headRow1: HeadCell[] = [
    { content: 'N', rowSpan: 2 },
    { content: 'FECHA', rowSpan: 2 },
    { content: 'CONTENEDOR', rowSpan: 2 },
    { content: 'PRODUCTO', rowSpan: 2 },
    { content: 'UBC', rowSpan: 2 },
    { content: 'S.P.', rowSpan: 2 },
    ...REPORTE_SLOTS.map((h) => ({
      content: `${String(h).padStart(2, '0')}:00 Hrs`,
      colSpan: 2,
      styles: { halign: 'center' as const },
    })),
    { content: 'OBSERVACIONES', rowSpan: 2 },
  ];

  const headRow2: HeadCell[] = REPORTE_SLOTS.flatMap(() => ['SUP', 'RET']);

  const startY = 17 + lines.length * 5 + 4;

  const body: string[][] = filas.map((f) => {
    const row: string[] = [
      String(f.n),
      f.fechaFmt,
      f.contenedor,
      f.producto,
      f.ubc,
      f.setPointFmt,
    ];
    for (const c of f.celdas) {
      row.push(
        c.sup != null && !Number.isNaN(c.sup) ? c.sup.toFixed(1) : '—',
        c.ret != null && !Number.isNaN(c.ret) ? c.ret.toFixed(1) : '—'
      );
    }
    row.push(f.observaciones);
    return row;
  });

  autoTable(doc, {
    startY,
    head: [headRow1, headRow2] as any,
    body,
    styles: { fontSize: 5, cellPadding: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: [55, 65, 81], fontSize: 5, valign: 'middle' },
    margin: { left: 8, right: 8 },
    columnStyles: {
      18: { cellWidth: 42 },
    },
  });

  const safe = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  doc.save(`reporte_interno_${safe}.pdf`);
}
