import { formatDateTimeTz } from './timezone.js';
import * as XLSX from 'xlsx';

const CHART_CID = 'reefer-monitoring-chart';

function fmtNum(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return String(v);
}

function fmtTemp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}°C`;
}

/** power_state: 1 → ON, 0 → OFF, otro → — */
export function fmtPowerState(v) {
  if (v === 1 || v === '1') return 'ON';
  if (v === 0 || v === '0') return 'OFF';
  return '—';
}

function tablaPuntos(trazabilidad) {
  return trazabilidad?.puntosTabla?.length
    ? trazabilidad.puntosTabla
    : trazabilidad?.puntos ?? [];
}

function graficoPuntos(trazabilidad) {
  return trazabilidad?.puntosGrafico?.length
    ? trazabilidad.puntosGrafico
    : [...tablaPuntos(trazabilidad)].reverse();
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectTempValues(puntos) {
  const values = [];
  for (const p of puntos) {
    for (const key of ['returnAir', 'tempSupply', 'setPoint']) {
      const v = p[key];
      if (v != null && !Number.isNaN(v)) values.push(v);
    }
  }
  return values;
}

function localMaximaIndices(puntos, key, maxLabels = 10) {
  const indices = [];
  for (let i = 1; i < puntos.length - 1; i += 1) {
    const v = puntos[i][key];
    const prev = puntos[i - 1][key];
    const next = puntos[i + 1][key];
    if (v == null || Number.isNaN(v)) continue;
    if (prev != null && next != null && v >= prev && v >= next && v > (prev + next) / 2 + 0.3) {
      indices.push(i);
    }
  }
  if (indices.length <= maxLabels) return indices;
  const step = Math.ceil(indices.length / maxLabels);
  return indices.filter((_, i) => i % step === 0);
}

/** Gráfico estilo monitoreo reefer (Return, Supply, SetPoint). */
export function buildMonitoringChartSvg(puntos, chartTitle = 'Reefer Monitoring Data') {
  if (!puntos?.length) return '';

  const w = 820;
  const h = 420;
  const pad = { t: 52, r: 24, b: 72, l: 56 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const values = collectTempValues(puntos);
  if (values.length === 0) return '';

  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 2;
    yMax += 2;
  }
  const yPad = Math.max((yMax - yMin) * 0.12, 1);
  yMin = Math.floor((yMin - yPad) * 2) / 2;
  yMax = Math.ceil((yMax + yPad) * 2) / 2;

  const xAt = (i) =>
    pad.l + (puntos.length <= 1 ? innerW / 2 : (i / (puntos.length - 1)) * innerW);
  const yAt = (v) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const linePath = (key) => {
    const pts = [];
    puntos.forEach((p, i) => {
      const v = p[key];
      if (v == null || Number.isNaN(v)) return;
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
    });
    return pts.join(' ');
  };

  const gridLines = [];
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i += 1) {
    const v = yMin + ((yMax - yMin) * i) / ySteps;
    const y = yAt(v);
    gridLines.push(
      `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`
    );
    gridLines.push(
      `<text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" font-size="10" fill="#666" text-anchor="end">${v.toFixed(1)}</text>`
    );
  }

  const xLabelCount = Math.min(7, puntos.length);
  const xLabels = [];
  for (let i = 0; i < xLabelCount; i += 1) {
    const idx =
      xLabelCount <= 1 ? 0 : Math.round((i / (xLabelCount - 1)) * (puntos.length - 1));
    const p = puntos[idx];
    const x = xAt(idx);
    const label = escapeXml(p.horaCompleta ?? p.hora ?? '');
    xLabels.push(`
      <text x="${x.toFixed(1)}" y="${h - 14}" font-size="9" fill="#444" text-anchor="end" transform="rotate(-35 ${x.toFixed(1)} ${h - 14})">${label}</text>
    `);
  }

  const returnLabels = localMaximaIndices(puntos, 'returnAir').map((i) => {
    const p = puntos[i];
    const v = p.returnAir;
    if (v == null) return '';
    return `<text x="${xAt(i).toFixed(1)}" y="${(yAt(v) - 6).toFixed(1)}" font-size="9" fill="#dc2626" text-anchor="middle">${v}</text>`;
  });

  const returnPath = linePath('returnAir');
  const supplyPath = linePath('tempSupply');
  const setPath = linePath('setPoint');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <text x="${w / 2}" y="24" font-size="14" font-weight="bold" fill="#111" text-anchor="middle">${escapeXml(chartTitle)}</text>
  <text x="${pad.l - 40}" y="${pad.t + innerH / 2}" font-size="11" fill="#333" transform="rotate(-90 ${pad.l - 40} ${pad.t + innerH / 2})">Temperature(C°)</text>
  ${gridLines.join('\n')}
  <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="#999"/>
  <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + innerH}" stroke="#999"/>
  ${setPath ? `<path d="${setPath}" fill="none" stroke="#eab308" stroke-width="2"/>` : ''}
  ${supplyPath ? `<path d="${supplyPath}" fill="none" stroke="#16a34a" stroke-width="1.8"/>` : ''}
  ${returnPath ? `<path d="${returnPath}" fill="none" stroke="#dc2626" stroke-width="2"/>` : ''}
  ${returnLabels.join('\n')}
  ${xLabels.join('\n')}
  <rect x="${w - 200}" y="36" width="188" height="58" fill="#fff" stroke="#ccc" rx="2"/>
  <line x1="${w - 190}" y1="52" x2="${w - 172}" y2="52" stroke="#dc2626" stroke-width="2"/><text x="${w - 168}" y="56" font-size="10" fill="#333">Return</text>
  <line x1="${w - 190}" y1="68" x2="${w - 172}" y2="68" stroke="#16a34a" stroke-width="2"/><text x="${w - 168}" y="72" font-size="10" fill="#333">Supply</text>
  <line x1="${w - 190}" y1="84" x2="${w - 172}" y2="84" stroke="#eab308" stroke-width="2"/><text x="${w - 168}" y="88" font-size="10" fill="#333">SetPoint</text>
</svg>`;
}

async function svgToPngBuffer(svg) {
  if (!svg) return null;
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 820 },
      background: 'white',
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

function buildExcelBuffer(puntosTabla, meta = {}) {
  const header = ['Hora (GMT-5)', 'Set Point (°C)', 'Return Air (°C)', 'Supply (°C)', 'Power'];
  const rows = puntosTabla.map((p) => [
    p.horaCompleta ?? p.hora,
    p.setPoint ?? '',
    p.returnAir ?? '',
    p.tempSupply ?? '',
    fmtPowerState(p.powerState),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trazabilidad 3h');
  if (meta.titulo) {
    const info = XLSX.utils.aoa_to_sheet([
      ['Equipo', meta.titulo],
      ['Ventana', `Últimas ${meta.ventanaHoras ?? 3} h (GMT-5)`],
      ['Generado', formatDateTimeTz(meta.generadoAt ?? new Date())],
    ]);
    XLSX.utils.book_append_sheet(wb, info, 'Info');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function excelFilename(imei) {
  const slug = (imei ?? 'equipo').replace(/[^\w-]+/g, '_');
  const d = new Date().toISOString().slice(0, 10);
  return `trazabilidad_3h_${slug}_${d}.xlsx`;
}

/** Bloque texto plano: tabla ~30 min (desde el último dato). */
export function buildTrazabilidadText(trazabilidad) {
  const puntos = tablaPuntos(trazabilidad);
  if (!puntos.length) {
    return ['Evolución últimas 3 h: sin datos de historial disponibles.'];
  }
  const lines = [
    '',
    `Evolución telemetría (últimas ${trazabilidad.ventanaHoras} h, GMT-5, ~cada 30 min desde el último registro):`,
    'Hora (GMT-5)\tSet\tReturn\tSupply\tPower',
  ];
  for (const p of puntos) {
    lines.push(
      `${p.horaCompleta ?? p.hora}\t${fmtNum(p.setPoint)}\t${fmtNum(p.returnAir)}\t${fmtNum(p.tempSupply)}\t${fmtPowerState(p.powerState)}`
    );
  }
  lines.push('', 'Datos completos adjuntos en Excel (trazabilidad_3h_*.xlsx).');
  return lines;
}

/**
 * Prepara HTML, adjuntos Excel y PNG embebido (CID) para el correo.
 * @returns {Promise<{ html: string, attachments: object[] }>}
 */
export async function buildTrazabilidadEmailPack(trazabilidad, options = {}) {
  const { chartTitle = 'Reefer Monitoring Data', imei = 'equipo' } = options;
  const puntosTabla = tablaPuntos(trazabilidad);
  const puntosGrafico = graficoPuntos(trazabilidad);

  if (!puntosTabla.length && !puntosGrafico.length) {
    return {
      html: '<p><em>Evolución últimas 3 h: sin datos de historial disponibles.</em></p>',
      attachments: [],
    };
  }

  const rows = puntosTabla
    .map(
      (p) =>
        `<tr><td>${escapeXml(p.horaCompleta ?? p.hora)}</td><td>${fmtTemp(p.setPoint)}</td><td>${fmtTemp(p.returnAir)}</td><td>${fmtTemp(p.tempSupply)}</td><td>${fmtPowerState(p.powerState)}</td></tr>`
    )
    .join('');

  const svg = buildMonitoringChartSvg(puntosGrafico, chartTitle);
  const pngBuffer = await svgToPngBuffer(svg);
  const attachments = [];

  let chartHtml = '';
  if (pngBuffer) {
    attachments.push({
      filename: 'reefer_monitoring_chart.png',
      content: pngBuffer,
      cid: CHART_CID,
      contentType: 'image/png',
    });
    chartHtml = `<p><strong>Gráfica de comportamiento (últimas ${trazabilidad.ventanaHoras} h, GMT-5)</strong></p>
<img src="cid:${CHART_CID}" alt="Gráfica Return, Supply y SetPoint" style="max-width:100%;height:auto;border:1px solid #ddd"/>`;
  } else if (svg) {
    chartHtml = `<p><strong>Gráfica de comportamiento (últimas ${trazabilidad.ventanaHoras} h, GMT-5)</strong></p>
<div style="overflow-x:auto">${svg}</div>`;
  }

  const excelBuf = buildExcelBuffer(puntosGrafico.length ? puntosGrafico : puntosTabla, {
    titulo: chartTitle,
    ventanaHoras: trazabilidad.ventanaHoras,
    generadoAt: trazabilidad.generadoAt,
  });
  const excelName = excelFilename(imei);
  attachments.push({
    filename: excelName,
    content: excelBuf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const html = `<div style="margin-top:16px">
<p><strong>Evolución telemetría (últimas ${trazabilidad.ventanaHoras} h, GMT-5)</strong></p>
<p style="font-size:12px;color:#555">Tabla resumida ~cada 30 minutos desde el último dato registrado. Serie completa en Excel adjunto.</p>
${chartHtml}
<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px;width:100%;max-width:720px;margin-top:12px">
<thead style="background:#f0f0f0"><tr><th>Hora (GMT-5)</th><th>Set</th><th>Return</th><th>Supply</th><th>Power</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="font-size:11px;color:#666">Generado ${formatDateTimeTz(trazabilidad.generadoAt)} · Adjunto: <strong>${escapeXml(excelName)}</strong></p>
</div>`;

  return { html, attachments };
}

/** @deprecated usar buildTrazabilidadEmailPack */
export function buildTrazabilidadHtml(trazabilidad) {
  const puntos = tablaPuntos(trazabilidad);
  if (!puntos.length) {
    return '<p><em>Evolución últimas 3 h: sin datos de historial disponibles.</em></p>';
  }
  const rows = puntos
    .map(
      (p) =>
        `<tr><td>${p.horaCompleta ?? p.hora}</td><td>${fmtTemp(p.setPoint)}</td><td>${fmtTemp(p.returnAir)}</td><td>${fmtTemp(p.tempSupply)}</td><td>${fmtPowerState(p.powerState)}</td></tr>`
    )
    .join('');
  return `<div style="margin-top:16px"><table>...</table>${rows}</div>`;
}
