import { formatDateTimeTz } from './timezone.js';

function fmtNum(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return String(v);
}

function fmtTemp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}°C`;
}

/** Bloque texto plano: tabla de evolución 3 h. */
export function buildTrazabilidadText(trazabilidad) {
  if (!trazabilidad?.puntos?.length) {
    return ['Evolución últimas 3 h: sin datos de historial disponibles.'];
  }
  const lines = [
    '',
    `Evolución telemetría (últimas ${trazabilidad.ventanaHoras} h, GMT-5):`,
    'Hora\tSet\tReturn\tSupply\tPower',
  ];
  for (const p of trazabilidad.puntos) {
    lines.push(
      `${p.hora}\t${fmtNum(p.setPoint)}\t${fmtNum(p.returnAir)}\t${fmtNum(p.tempSupply)}\t${p.powerState ?? '—'}`
    );
  }
  return lines;
}

function buildSvgChart(puntos) {
  const w = 560;
  const h = 180;
  const pad = { t: 16, r: 16, b: 28, l: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const values = [];
  for (const p of puntos) {
    if (p.returnAir != null && !Number.isNaN(p.returnAir)) values.push(p.returnAir);
    if (p.setPoint != null && !Number.isNaN(p.setPoint)) values.push(p.setPoint);
    if (p.tempSupply != null && !Number.isNaN(p.tempSupply)) values.push(p.tempSupply);
  }
  if (values.length === 0) return '';

  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.1 || 1;
  yMin -= yPad;
  yMax += yPad;

  const xAt = (i) => pad.l + (puntos.length <= 1 ? innerW / 2 : (i / (puntos.length - 1)) * innerW);
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

  const returnPath = linePath('returnAir');
  const setPath = linePath('setPoint');
  const supplyPath = linePath('tempSupply');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="max-width:100%;height:auto">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#fafafa" stroke="#ddd"/>
  <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="#ccc"/>
  <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + innerH}" stroke="#ccc"/>
  <text x="${pad.l}" y="${h - 6}" font-size="10" fill="#666">${puntos[0]?.hora ?? ''}</text>
  <text x="${w - pad.r}" y="${h - 6}" font-size="10" fill="#666" text-anchor="end">${puntos[puntos.length - 1]?.hora ?? ''}</text>
  <text x="6" y="${pad.t + 8}" font-size="10" fill="#666">${yMax.toFixed(1)}°</text>
  <text x="6" y="${pad.t + innerH}" font-size="10" fill="#666">${yMin.toFixed(1)}°</text>
  ${setPath ? `<path d="${setPath}" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 3"/>` : ''}
  ${supplyPath ? `<path d="${supplyPath}" fill="none" stroke="#16a34a" stroke-width="1.5"/>` : ''}
  ${returnPath ? `<path d="${returnPath}" fill="none" stroke="#dc2626" stroke-width="2"/>` : ''}
  <text x="${pad.l + 4}" y="${pad.t + 12}" font-size="10" fill="#dc2626">● Return</text>
  <text x="${pad.l + 64}" y="${pad.t + 12}" font-size="10" fill="#16a34a">● Supply</text>
  <text x="${pad.l + 130}" y="${pad.t + 12}" font-size="10" fill="#2563eb">--- Set</text>
</svg>`;
}

/** Bloque HTML: gráfico SVG + tabla de evolución. */
export function buildTrazabilidadHtml(trazabilidad) {
  if (!trazabilidad?.puntos?.length) {
    return '<p><em>Evolución últimas 3 h: sin datos de historial disponibles.</em></p>';
  }

  const svg = buildSvgChart(trazabilidad.puntos);
  const rows = trazabilidad.puntos
    .map(
      (p) =>
        `<tr><td>${p.hora}</td><td>${fmtTemp(p.setPoint)}</td><td>${fmtTemp(p.returnAir)}</td><td>${fmtTemp(p.tempSupply)}</td><td>${p.powerState ?? '—'}</td></tr>`
    )
    .join('');

  return `<div style="margin-top:16px">
<p><strong>Evolución telemetría (últimas ${trazabilidad.ventanaHoras} h, GMT-5)</strong></p>
${svg ? `<div style="margin:8px 0">${svg}</div>` : ''}
<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px;width:100%;max-width:560px">
<thead style="background:#f0f0f0"><tr><th>Hora</th><th>Set</th><th>Return</th><th>Supply</th><th>Power</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="font-size:11px;color:#666">Generado ${formatDateTimeTz(trazabilidad.generadoAt)} · ${trazabilidad.puntos.length} puntos</p>
</div>`;
}
