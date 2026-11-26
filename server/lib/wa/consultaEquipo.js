import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { resolveRangoOptsForDevice } from '../deviceAlertConfigRepository.js';
import { fetchHistorialUltimasHoras } from '../historicalTelemetry.js';
import { getHistorialVistaPrefs } from '../historialVistaPrefsRepository.js';
import { parseTelemetryTimestamp } from '../timezone.js';
import { evaporadorParaGrafica, evaporadorValido, usdaValido } from '../lecturasValidas.js';
import { etiqueta } from './equiposCuenta.js';
import { rangoWhatsappDe } from './controlFlota.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtNumero(v) {
  const n = num(v);
  return n == null ? '—' : n.toFixed(1);
}

function fmt(v) {
  return fmtNumero(v);
}

function negrita(v) {
  return `*${v}*`;
}

function horaLima(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

function esTermokingOTunel(codigo) {
  const c = String(codigo || '').toUpperCase();
  return c === 'TERMOKING' || c === 'TUNEL' || c === 'THERMOKING';
}

export function marcaDe(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (c === 'TERMOKING' || c === 'TUNEL' || c === 'THERMOKING') return 'Thermoking';
  if (c === 'STARCOOL' || c === 'STARCOOL2') return 'StarCool';
  return c || null;
}

export function fechaCorta(value) {
  if (value == null || value === '') return '—';
  const ms = value instanceof Date ? value.getTime() : parseTelemetryTimestamp(value);
  if (!Number.isFinite(ms)) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const g = (tipo) => parts.find((p) => p.type === tipo)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

export function detalleLinea(e) {
  const marca = marcaDe(e.codigo);
  return [
    marca ? `Marca ${marca}` : null,
    `IMEI ${e.imei}`,
    e.celular ? `cel ${e.celular}` : null,
    e.estado_conexion ? String(e.estado_conexion).toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function resaltarZgru(texto) {
  return String(texto ?? '').replace(/(ZGRU\w*)/gi, '*$1*');
}

export function labelLista(e) {
  return resaltarZgru(etiqueta(e));
}

export function pieMenu() {
  return [
    '1 - Último dato',
    '2 - Información detallada',
    '3 - Últimos 20 datos',
    '4 - Gráfica 3 horas',
    '5 - Gráfica 12 horas',
    '6 - Archivo CSV 12 horas',
    '7 - Análisis de rango y apagado',
    'volver - lista de equipos',
  ].join('\n');
}

const PIE_MENU = pieMenu();

export function textoMenuEquipo(e) {
  return `*${etiqueta(e)}*\n\nElige una opción:\n${PIE_MENU}`;
}

export function bandaNormal(e, username) {
  const rowKey = e?.rowKey || (e?.codigo && e?.imei ? `${e.codigo}-${e.imei}` : null);
  const wa = rangoWhatsappDe(username, rowKey);
  if (wa) {
    return {
      min: wa.rangoMin,
      max: wa.rangoMax,
      opts: { useRangoPersonalizado: true, margenInferior: wa.rangoMin, margenSuperior: wa.rangoMax },
    };
  }
  const correo = resolveRangoOptsForDevice(rowKey, username);
  if (correo) {
    return { min: correo.margenInferior, max: correo.margenSuperior, opts: correo };
  }
  return { min: 4, max: 4, opts: null };
}

function textoBanda(setPoint, banda) {
  const min = banda?.min ?? 4;
  const max = banda?.max ?? 4;
  const sp = num(setPoint);
  if (sp == null) return `${fmt(min)} °C bajo el set y ${fmt(max)} °C sobre el set`;
  const bajo = Math.round((sp - min) * 10) / 10;
  const alto = Math.round((sp + max) * 10) / 10;
  return `${fmt(bajo)} a ${fmt(alto)} °C (set ${fmt(sp)}, mínimo ${fmt(min)}, máximo ${fmt(max)})`;
}

export function lineaRangoNormal(setPoint, banda) {
  const min = banda?.min ?? 4;
  const max = banda?.max ?? 4;
  const sp = num(setPoint);
  if (sp == null) {
    return `Rango normal: ${negrita(fmt(min))} °C bajo el set y ${negrita(fmt(max))} °C sobre el set.`;
  }
  const bajo = Math.round((sp - min) * 10) / 10;
  const alto = Math.round((sp + max) * 10) / 10;
  return `Rango normal: ${negrita(fmt(bajo))} a ${negrita(fmt(alto))} °C (set ${negrita(fmt(sp))}, mínimo ${fmt(min)}, máximo ${fmt(max)}).`;
}

export function textoDetalle(e, username) {
  const u = e._flota?.ultimo_dato ?? e.ultimo_dato ?? {};
  const lineas = [
    `*${etiqueta(e)}*`,
    detalleLinea(e),
    `Última conexión: ${fechaCorta(e.ultima_actualizacion || e._flota?.ultima_actualizacion)}`,
    lineaRangoNormal(u.set_point, bandaNormal(e, username)),
    '',
    `Set ${negrita(fmt(u.set_point))} °C`,
    `Suministro ${negrita(fmt(u.temp_supply_1))} °C`,
    `Retorno ${negrita(fmt(u.return_air))} °C`,
    `Evaporador ${negrita(fmt(evaporadorValido(u.evaporation_coil)))} °C`,
  ];
  if (esTermokingOTunel(e.codigo)) {
    const energia = e._flota?.power_state_texto || (num(u.power_state) === 1 ? 'on' : num(u.power_state) === 0 ? 'off' : null);
    lineas.push(`Compresor ${negrita(fmt(u.compress_coil_1))} °C`);
    lineas.push(`Potencia ${negrita(fmt(u.power_kwh))} kWh${energia ? ` · energía ${negrita(energia)}` : ''}`);
  }
  lineas.push('', PIE_MENU);
  return lineas.join('\n');
}

function puntoDe(row) {
  const t = row.telemetry && typeof row.telemetry === 'object' ? row.telemetry : row;
  return {
    at: t.capturedAt || row.created_at || row.fecha || row.captured_at || row.capturedAt,
    set: num(t.set_point),
    sup: num(t.temp_supply_1),
    ret: num(t.return_air),
    eva: evaporadorParaGrafica(t.evaporation_coil),
    power: num(t.power_state),
  };
}

function anclaConexion(e) {
  const ms = parseTelemetryTimestamp(
    e?.ultima_actualizacion || e?._flota?.ultima_actualizacion || e?.ultimo_dato?.created_at || e?.ultimo_dato?.fecha
  );
  if (!Number.isFinite(ms)) return new Date();
  return new Date(ms);
}

function notaConexion(e, ancla) {
  const edadMin = (Date.now() - ancla.getTime()) / 60000;
  if (edadMin < 20) return null;
  const estado = String(e?.estado_conexion || e?._flota?.estado_conexion || 'wait').toUpperCase();
  return `Sin datos nuevos desde ${fechaCorta(ancla)}. El equipo está en *${estado}*. Esto es la última información real de esa conexión, no la hora de ahora.`;
}

function dedupeFilas(filas) {
  const vistas = new Set();
  const out = [];
  for (const row of filas) {
    const t = parseTelemetryTimestamp(row?.created_at ?? row?.fecha);
    const clave = Number.isFinite(t)
      ? String(t)
      : `${row?.set_point}|${row?.return_air}|${row?.temp_supply_1}|${row?.created_at || ''}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(row);
  }
  return out;
}

function dedupePuntos(puntos) {
  const out = [];
  for (const p of puntos) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.set === p.set &&
      prev.sup === p.sup &&
      prev.ret === p.ret &&
      prev.eva === p.eva &&
      prev.power === p.power
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

async function muestrasLocales(imei, horas, limit) {
  const params = [String(imei)];
  let sql = `SELECT captured_at, telemetry
     FROM dashboard_device_sample
     WHERE imei = $1 AND telemetry IS NOT NULL`;
  if (horas) {
    params.push(horas);
    sql += ` AND captured_at >= now() - ($2::text || ' hours')::interval`;
  }
  sql += ` ORDER BY captured_at DESC`;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const r = await query(sql, params);
  return r.rows.map(puntoDe).filter((p) => p.at);
}

function puntosHistorico3h(equipo) {
  const datos = equipo?._flota?.historico_3h?.datos;
  if (!Array.isArray(datos)) return [];
  return datos.map((row) => puntoDe(row)).filter((p) => p.at);
}

export async function textoUltimos20(e, username) {
  const { filas, nota } = await filasHistorial(e, 72);
  let puntos = dedupePuntos(filas.map((row) => puntoDe(row)).filter((p) => p.at));
  if (!puntos.length) {
    puntos = dedupePuntos(await muestrasLocales(e.imei, null, 80));
  }
  if (!puntos.length) puntos = dedupePuntos(puntosHistorico3h(e));
  if (!puntos.length) {
    return `*${etiqueta(e)}*\nNo hay muestras guardadas de este equipo.\n\n${PIE_MENU}`;
  }
  puntos.sort((a, b) => new Date(b.at) - new Date(a.at));
  puntos = puntos.slice(0, 20);
  const lineas = puntos.map(
    (p) =>
      `${fechaCorta(p.at)}\nset ${negrita(fmt(p.set))} · sum ${negrita(fmt(p.sup))} · ret ${negrita(fmt(p.ret))} · eva ${negrita(fmt(p.eva))}`
  );
  const reciente = puntos[0];
  const antiguo = puntos[puntos.length - 1];
  const aviso = nota ? `${nota}\n` : '';
  return `*${etiqueta(e)}* · últimos ${puntos.length}\n${aviso}Desde ${fechaCorta(antiguo.at)} hasta ${fechaCorta(reciente.at)}.\n${lineaRangoNormal(reciente?.set, bandaNormal(e, username))}\n\n${lineas.join('\n')}\n\n${PIE_MENU}`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pathDe(puntos, key, x, y) {
  let d = '';
  let abierto = false;
  for (const p of puntos) {
    const v = p[key];
    if (v == null) {
      abierto = false;
      continue;
    }
    d += `${abierto ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(v).toFixed(1)} `;
    abierto = true;
  }
  return d.trim();
}

function svgGrafica(puntos, titulo) {
  const W = 820;
  const H = 460;
  const L = 52;
  const R = 16;
  const T = 56;
  const B = 36;
  const vals = puntos.flatMap((p) => [p.set, p.sup, p.ret, p.eva].filter((v) => v != null));
  if (!vals.length) return null;
  let minY = Math.min(...vals);
  let maxY = Math.max(...vals);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const pad = (maxY - minY) * 0.12;
  minY -= pad;
  maxY += pad;
  const minT = puntos[0].t;
  const maxT = puntos[puntos.length - 1].t || minT + 1;
  const x = (t) => L + ((t - minT) / (maxT - minT || 1)) * (W - L - R);
  const y = (v) => T + ((maxY - v) / (maxY - minY || 1)) * (H - T - B);
  const series = [
    ['set', '#FDD835', 'Set Temp', 2.5],
    ['eva', '#9E9E9E', 'Evaporador', 2],
    ['sup', '#1B5E20', 'Suministro', 2],
    ['ret', '#E53935', 'Retorno', 2],
  ];
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const v = minY + ((maxY - minY) * i) / 4;
    const yy = y(v);
    grid.push(
      `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="#e5e7eb"/>` +
        `<text x="${L - 6}" y="${(yy + 3).toFixed(1)}" font-size="11" text-anchor="end" fill="#666">${v.toFixed(0)}</text>`
    );
  }
  const marcas = [puntos[0], puntos[Math.floor(puntos.length / 2)], puntos[puntos.length - 1]].filter(Boolean);
  const ejes = marcas.map(
    (p) =>
      `<text x="${x(p.t).toFixed(1)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#444">${escapeXml(horaLima(new Date(p.t).toISOString()))}</text>`
  );
  const paths = series
    .map(([key, color, , ancho]) => {
      const d = pathDe(puntos, key, x, y);
      return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ancho}"/>` : '';
    })
    .join('');
  const leyendaOrden = [
    ['sup', '#1B5E20', 'Suministro'],
    ['ret', '#E53935', 'Retorno'],
    ['eva', '#9E9E9E', 'Evaporador'],
    ['set', '#FDD835', 'Set Temp'],
  ];
  const leyenda = leyendaOrden
    .map(
      ([, color, nombre], i) =>
        `<line x1="${L + i * 175}" y1="34" x2="${L + 22 + i * 175}" y2="34" stroke="${color}" stroke-width="3"/>` +
        `<text x="${L + 28 + i * 175}" y="38" font-size="12" fill="#333">${nombre}</text>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${W / 2}" y="20" font-size="15" text-anchor="middle" fill="#111">${escapeXml(titulo)}</text>
  ${leyenda}
  ${grid.join('')}
  <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#999"/>
  <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#999"/>
  ${paths}
  ${ejes.join('')}
</svg>`;
}

function fuentesDejaVu() {
  const candidatos = [
    path.join(__dirname, '../assets/fonts/DejaVuSans.ttf'),
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  return candidatos.filter((p) => fs.existsSync(p)).slice(0, 1);
}

async function pngDeSvg(svg) {
  const { Resvg } = await import('@resvg/resvg-js');
  const fontFiles = fuentesDejaVu();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 820 },
    background: 'white',
    font: {
      loadSystemFonts: fontFiles.length === 0,
      fontFiles,
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans',
      serifFamily: 'DejaVu Sans',
      monospaceFamily: 'DejaVu Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

function adelgazar(puntos, tope = 80) {
  if (puntos.length <= tope) return puntos;
  const paso = Math.ceil(puntos.length / tope);
  const out = puntos.filter((_, i) => i % paso === 0);
  const ultimo = puntos[puntos.length - 1];
  if (out[out.length - 1] !== ultimo) out.push(ultimo);
  return out;
}

export async function graficaHoras(e, horas, opts = {}) {
  const { filas, origen, nota } = await filasHistorial(e, horas);
  let puntos = dedupePuntos(filas.map((row) => puntoDe(row)).filter((p) => p.at));
  let fuente = origen;
  if (puntos.length < 2) {
    const local = dedupePuntos(await muestrasLocales(e.imei, null, 400));
    const ancla = anclaConexion(e).getTime();
    const desde = ancla - horas * 3600000;
    const enVentana = local.filter((p) => {
      const t = new Date(p.at).getTime();
      return t >= desde - 60000 && t <= ancla + 60000;
    });
    if (enVentana.length >= 2) {
      puntos = enVentana;
      fuente = 'muestras guardadas';
    } else if (horas === 3 && puntosHistorico3h(e).length >= 2) {
      puntos = dedupePuntos(puntosHistorico3h(e));
      fuente = 'historial de 3 h guardado';
    }
  }
  const aviso = nota ? `${nota}\n` : '';
  if (puntos.length < 2) {
    return {
      texto: `*${etiqueta(e)}*\n${aviso}No hay suficientes datos distintos en las ${horas} h anteriores a su última conexión para graficar.\n\n${PIE_MENU}`,
    };
  }
  const conTiempo = puntos
    .map((p) => ({ ...p, t: new Date(p.at).getTime() }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  const svg = svgGrafica(adelgazar(conTiempo), opts.titulo || `${etiqueta(e)} · ${horas} h`);
  if (!svg) {
    return { texto: `*${etiqueta(e)}*\nLas muestras no traen temperaturas.\n\n${PIE_MENU}` };
  }
  const png = await pngDeSvg(svg);
  const desde = fechaCorta(conTiempo[0].at);
  const hasta = fechaCorta(conTiempo[conTiempo.length - 1].at);
  return {
    media: {
      mimetype: 'image/png',
      base64: png.toString('base64'),
      filename: `ztrack_${horas}h_${e.imei}.png`,
    },
    texto: `Gráfica ${horas} h de su conexión · ${etiqueta(e)}\n${aviso}${desde} a ${hasta} (${fuente}, ${conTiempo.length} muestras)\n${PIE_MENU}`,
  };
}

const COLUMNAS = {
  temp_supply_1: ['Suministro °C', '°C'],
  temp_supply_2: ['Suministro 2 °C', '°C'],
  return_air: ['Retorno °C', '°C'],
  evaporation_coil: ['Evaporador °C', '°C'],
  condensation_coil: ['Condensador °C', '°C'],
  compress_coil_1: ['Compresor °C', '°C'],
  ambient_air: ['Exterior °C', '°C'],
  cargo_1_temp: ['USDA 1 °C', '°C'],
  cargo_2_temp: ['USDA 2 °C', '°C'],
  cargo_3_temp: ['USDA 3 °C', '°C'],
  cargo_4_temp: ['USDA 4 °C', '°C'],
  relative_humidity: ['Humedad %', '%'],
  avl: ['AVL cfm', 'cfm'],
  line_voltage: ['Voltaje V', 'V'],
  line_frequency: ['Frecuencia Hz', 'Hz'],
  consumption_ph_1: ['Fase 1 A', 'A'],
  consumption_ph_2: ['Fase 2 A', 'A'],
  consumption_ph_3: ['Fase 3 A', 'A'],
  set_point: ['Set °C', '°C'],
  capacity_load: ['Potencia compresor %', '%'],
  power_state: ['Energía', ''],
  power_kwh: ['Potencia kWh', 'kWh'],
  co2_reading: ['CO2', ''],
  ethylene: ['Etileno', ''],
  controlling_mode: ['Modo control', ''],
  alarm_present: ['Alarmas', ''],
};

const TABLA_DEFECTO = [
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'set_point',
  'compress_coil_1',
  'ambient_air',
  'cargo_1_temp',
  'cargo_2_temp',
  'cargo_3_temp',
  'cargo_4_temp',
  'line_voltage',
  'line_frequency',
  'consumption_ph_1',
  'consumption_ph_2',
  'consumption_ph_3',
  'relative_humidity',
  'power_state',
];

function columnasDe(e, username) {
  const prefs = username ? getHistorialVistaPrefs(username, e.imei) : null;
  const keys = Array.isArray(prefs?.tableKeys) && prefs.tableKeys.length ? prefs.tableKeys : TABLA_DEFECTO;
  return [...new Set(keys.map(String))];
}

const USDA = new Set(['cargo_1_temp', 'cargo_2_temp', 'cargo_3_temp', 'cargo_4_temp']);
const CERO_SIN_LECTURA_STARCOOL = new Set([
  'line_voltage',
  'consumption_ph_1',
  'consumption_ph_2',
  'consumption_ph_3',
  'relative_humidity',
]);

function esStarcool(codigo) {
  const c = String(codigo || '').toUpperCase();
  return c === 'STARCOOL' || c === 'STARCOOL2';
}

/** USDA menor a −30 °C y evaporador mayor a 99 °C no se muestran. En StarCool, 0 en voltaje, fases y humedad es el valor por defecto, no una medición. */
export function lecturaVisible(key, value, codigo) {
  const n = num(value);
  if (n == null) return value == null || value === '' ? '' : String(value);
  if (USDA.has(key) && (usdaValido(n) == null || n > 40)) return '';
  if (key === 'evaporation_coil' && evaporadorValido(n) == null) return '';
  if (esStarcool(codigo) && CERO_SIN_LECTURA_STARCOOL.has(key) && n === 0) return 'NA';
  return fmt(n);
}

function valorColumna(row, key, codigo) {
  if (key === 'power_state') {
    const n = num(row?.power_state);
    if (n === 1) return 'encendido';
    if (n === 0) return 'apagado';
    return '';
  }
  return lecturaVisible(key, row?.[key], codigo);
}

function nombreArchivo(e) {
  const base = String(e.nombre || `equipo_${e.imei}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return `${base || 'equipo'}_12h.csv`;
}

function celdaCsv(v) {
  const s = v == null ? '' : String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function numCsv(v) {
  const n = num(v);
  if (n == null) return '';
  return String(n).replace('.', ',');
}

function valorCsv(row, key, codigo) {
  if (key === 'power_state') return valorColumna(row, key);
  const visible = lecturaVisible(key, row?.[key], codigo);
  if (visible === '' || visible === 'NA' || visible === 'dato erróneo') return visible;
  const n = num(row?.[key]);
  return n == null ? visible : numCsv(n);
}

function filaMasNueva(filas) {
  let mejor = null;
  let ts = -Infinity;
  for (const row of filas) {
    const t = parseTelemetryTimestamp(row.created_at ?? row.fecha);
    if (!Number.isFinite(t) || t < ts) continue;
    ts = t;
    mejor = row;
  }
  return mejor;
}

export async function textoUltimoDato(e, username) {
  const { filas, origen, nota } = await filasHistorial(e, 6);
  const row = filaMasNueva(filas);
  const local = e._flota?.ultimo_dato ?? e.ultimo_dato ?? null;
  const trama = row || local;
  if (!trama) {
    return `*${etiqueta(e)}*\n${nota ? `${nota}\n` : ''}No hay una trama de su última conexión.\n\n${PIE_MENU}`;
  }
  const keys = columnasDe(e, username);
  const lineas = [
    `*${etiqueta(e)}* · último dato`,
    nota,
    detalleLinea(e),
    `Hora de la trama: ${fechaCorta(trama.created_at ?? trama.fecha ?? e.ultima_actualizacion)}`,
    origen && row ? `Fuente: ${origen}` : 'Fuente: última trama del sistema',
    lineaRangoNormal(trama.set_point, bandaNormal(e, username)),
    '',
  ].filter((linea) => linea != null && linea !== '');
  let conValor = false;
  for (const k of keys) {
    const valor = valorColumna(trama, k, e.codigo);
    if (!valor) continue;
    conValor = true;
    lineas.push(`${COLUMNAS[k]?.[0] || k}: ${negrita(valor)}`);
  }
  if (!conValor) lineas.push('La trama no trae temperaturas.');
  lineas.push('', PIE_MENU);
  return lineas.join('\n');
}

export async function filasHistorial(e, horas) {
  const ancla = anclaConexion(e);
  const nota = notaConexion(e, ancla);
  try {
    const data = await fetchHistorialUltimasHoras(e.codigo, e.imei, horas, ancla);
    const datos = dedupeFilas(Array.isArray(data?.datos) ? data.datos : []);
    if (datos.length) return { filas: datos, origen: 'historial oficial', ancla, nota };
  } catch (err) {
    console.warn('[wa] historial', e.imei, err.message);
  }
  const local = dedupePuntos([...(await muestrasLocales(e.imei, null, 400))].reverse());
  const hasta = ancla.getTime();
  const desde = hasta - horas * 3600000;
  const enVentana = local.filter((p) => {
    const t = new Date(p.at).getTime();
    return Number.isFinite(t) && t >= desde - 60000 && t <= hasta + 60000;
  });
  const elegidos = enVentana.length ? enVentana : local.slice(-1);
  const filas = elegidos.map((p) => ({
    created_at: p.at,
    set_point: p.set,
    temp_supply_1: p.sup,
    return_air: p.ret,
    evaporation_coil: p.eva,
    power_state: p.power,
  }));
  return { filas, origen: filas.length ? 'muestras guardadas' : 'sin datos', ancla, nota };
}

export async function excel12h(e, username) {
  const { filas, origen, nota } = await filasHistorial(e, 12);
  if (!filas.length) {
    return {
      texto: `*${etiqueta(e)}*\nNo hay datos de las últimas 12 h para el archivo.\n\n${PIE_MENU}`,
    };
  }
  const keys = columnasDe(e, username);
  const horas = filas.map((row) => fechaCorta(row.created_at ?? row.fecha)).filter((h) => h && h !== '—');
  const desde = horas.length ? horas.reduce((a, b) => (a < b ? a : b)) : '—';
  const hasta = horas.length ? horas.reduce((a, b) => (a > b ? a : b)) : '—';
  const setRef = filas.reduce((sp, row) => (num(row.set_point) != null ? row.set_point : sp), null);
  const banda = bandaNormal(e, username);
  const encabezado = ['Hora (GMT-5)', ...keys.map((k) => COLUMNAS[k]?.[0] || k)];
  const filasCsv = [
    ['Equipo', etiqueta(e)],
    ['Marca', marcaDe(e.codigo) || ''],
    ['IMEI', e.imei],
    ['Celular', e.celular || ''],
    ['Ventana', '12 horas anteriores a la última conexión'],
    ['Desde', desde],
    ['Hasta', hasta],
    ['Rango normal', textoBanda(setRef, banda)],
    ['Registros', String(filas.length)],
    ['Origen', origen],
    [],
    encabezado,
    ...filas.map((row) => [
      fechaCorta(row.created_at ?? row.fecha),
      ...keys.map((k) => valorCsv(row, k, e.codigo)),
    ]),
  ];
  const cuerpo = `\uFEFFsep=;\n${filasCsv.map((fila) => fila.map(celdaCsv).join(';')).join('\n')}\n`;
  return {
    media: {
      mimetype: 'text/csv',
      base64: Buffer.from(cuerpo, 'utf8').toString('base64'),
      filename: nombreArchivo(e),
      documento: true,
    },
    texto: `CSV 12 h de su conexión · ${etiqueta(e)}\n${nota ? `${nota}\n` : ''}${desde} a ${hasta} · ${filas.length} registros (${origen}).\n${lineaRangoNormal(setRef, banda)}\n${PIE_MENU}`,
  };
}
