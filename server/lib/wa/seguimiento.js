import { query } from '../db.js';
import { equiposEfectivosDeContacto } from './equiposCuenta.js';
import { resaltarZgru } from './consultaEquipo.js';

function horasTexto(h) {
  if (h == null || Number.isNaN(h)) return 'ahora';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${Math.round(h * 10) / 10} h`;
}

function horasDeRacha(rows, pred) {
  if (!rows?.length || !pred(rows[0])) return null;
  let desde = new Date(rows[0].captured_at).getTime();
  for (const row of rows) {
    if (!pred(row)) break;
    desde = new Date(row.captured_at).getTime();
  }
  return (Date.now() - desde) / 3600000;
}

async function rachas(imeis) {
  const por = new Map();
  if (!imeis.length) return por;
  const r = await query(
    `SELECT imei,
            lower(estado_conexion) AS estado,
            lower(COALESCE(power_state, '')) AS power,
            rango_estado,
            captured_at
     FROM dashboard_device_sample
     WHERE imei = ANY($1::text[])
       AND captured_at >= now() - interval '7 days'
     ORDER BY imei, captured_at DESC`,
    [imeis]
  );
  for (const row of r.rows) {
    if (!por.has(row.imei)) por.set(row.imei, []);
    por.get(row.imei).push(row);
  }
  return por;
}

/**
 * Solo entra al resumen lo que ya pasó el umbral:
 * fuera de rango más de 1 h, o fuera de línea más de 2 h.
 * Menos de eso se toma como normal.
 */
export async function problemasDeContacto(contacto) {
  const equipos = await equiposEfectivosDeContacto(contacto);
  const marcas = [];
  for (const e of equipos) {
    const d = e._flota || {};
    const power = String(d.power_state_texto || '').toLowerCase();
    const conexion = String(e.estado_conexion || d.estado_conexion || '').toLowerCase();
    const fuera = power !== 'off' && d.en_rango === false;
    const offline = conexion === 'offline';
    if (!fuera && !offline) continue;
    marcas.push({ equipo: e, fuera, offline });
  }
  const muestras = await rachas(marcas.map((m) => String(m.equipo.imei)));
  const items = [];
  for (const m of marcas) {
    const rows = muestras.get(String(m.equipo.imei)) || [];
    const horasFuera = m.fuera ? horasDeRacha(rows, (row) => row.rango_estado === 'fuera') : null;
    const horasOff = m.offline ? horasDeRacha(rows, (row) => row.estado === 'offline') : null;
    const pasaFuera = horasFuera != null && horasFuera > 1;
    const pasaOff = horasOff != null && horasOff > 2;
    if (!pasaFuera && !pasaOff) continue;
    const clase = pasaFuera ? 'fuera' : 'offline';
    const estado = pasaFuera ? 'fuera de rango' : 'fuera de línea';
    const horas = pasaFuera ? horasFuera : horasOff;
    const extra = pasaFuera && pasaOff ? ' · fuera de línea' : '';
    const nombre = resaltarZgru(m.equipo.nombre || m.equipo.imei);
    items.push({
      tipo: 'dispositivo',
      equipo: m.equipo,
      clase,
      label: `${nombre} — ${estado}${extra} · ${horasTexto(horas)}`,
    });
  }
  const peso = { fuera: 0, offline: 1 };
  items.sort((a, b) => peso[a.clase] - peso[b.clase] || a.label.localeCompare(b.label, 'es'));
  return { totalEquipos: equipos.length, items };
}

export function textoSeguimiento(items, { totalEquipos, cuentas, hasMore, hasPrev, page, totalPages }) {
  const fuera = cuentas.fuera;
  const offline = cuentas.offline;
  const lineas = [
    '*Resumen de seguimiento*',
    `Sigues *${totalEquipos}* equipo(s).`,
    `Fuera de rango, más de 1 h: *${fuera}*`,
    `Fuera de línea, más de 2 h: *${offline}*`,
    'Menos de eso se toma como normal y no entra aquí.',
  ];
  if (!items.length) {
    lineas.push('', 'Ninguno pasa ese tiempo.', '', '*menu* abre la lista completa.');
    return lineas.join('\n');
  }
  let titulo = '';
  items.forEach((it, i) => {
    if (it.clase !== titulo) {
      titulo = it.clase;
      const cabeza = it.clase === 'fuera' ? 'Fuera de rango, más de 1 h' : 'Fuera de línea, más de 2 h';
      lineas.push('', `*${cabeza}*`);
    }
    lineas.push(`${i + 1} - ${it.label}`);
  });
  if (totalPages > 1) {
    lineas.push('', `Página ${page + 1} de ${totalPages}.`);
    if (hasMore) lineas.push('*9* o *siguiente* — página siguiente');
    if (hasPrev) lineas.push('*0* o *anterior* — página anterior');
  }
  lineas.push('', 'Elige el *número* para ver el detalle de ese equipo.', '*menu* lista todos. *resumen* actualiza esto.');
  return lineas.join('\n');
}
