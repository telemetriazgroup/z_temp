import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { REPORTE_SLOTS, type ReporteInternoFila } from './reporteInterno';

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

  const head: string[] = [
    'N',
    'FECHA',
    'CONTENEDOR',
    'PRODUCTO',
    'UBC',
    'S.P.',
  ];
  for (const h of REPORTE_SLOTS) {
    const lbl = `${String(h).padStart(2, '0')}:00`;
    head.push(`${lbl} SUP`);
    head.push(`${lbl} RET`);
  }
  head.push('OBSERV.');

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
    head: [head],
    body,
    styles: { fontSize: 5, cellPadding: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: [55, 65, 81], fontSize: 5 },
    margin: { left: 8, right: 8 },
    columnStyles: {
      [head.length - 1]: { cellWidth: 42 },
    },
  });

  const safe = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  doc.save(`reporte_interno_${safe}.pdf`);
}
