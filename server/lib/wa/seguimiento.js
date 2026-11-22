import { query } from '../db.js';
import { equiposEfectivosDeContacto } from './equiposCuenta.js';

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
 * Equipos que este número tiene asignados o en seguimiento y que ahora
 * están fuera de rango, en espera o apagados, con el tiempo de esa condición.
 */
export async function problemasDeContacto(contacto) {
  const equipos = await equiposEfectivosDeContacto(contacto);
  const marcas = [];
  for (const e of equipos) {
    const d = e._flota || {};
    const power = String(d.power_state_texto || '').toLowerCase();
    const conexion = String(e.estado_conexion || d.estado_conexion || '').toLowerCase();
    const apagado = power === 'off';
    const fuera = !apagado && d.en_rango === false;
    const espera = conexion === 'wait';
    if (!apagado && !fuera && !espera) continue;
    const tipo = apagado ? 'apagado' : fuera ? 'fuera' : 'espera';
    marcas.push({ equipo: e, tipo, espera: espera && !apagado });
  }
  const muestras = await rachas(marcas.map((m) => String(m.equipo.imei)));
  const items = marcas.map((m) => {
    const rows = muestras.get(String(m.equipo.imei)) || [];
    let horas = null;
    if (m.tipo === 'apagado') {
      horas = horasDeRacha(rows, (row) => row.power === 'off' || row.rango_estado === 'apagado');
    } else if (m.tipo === 'fuera') {
      horas = horasDeRacha(rows, (row) => row.rango_estado === 'fuera');
    } else {
      horas = horasDeRacha(rows, (row) => row.estado === 'wait');
    }
    const estado = m.tipo === 'fuera' ? 'fuera de rango' : m.tipo === 'espera' ? 'en espera' : 'apagado';
    const extra = m.tipo === 'fuera' && m.espera ? ' · en espera' : '';
    const nombre = m.equipo.nombre || m.equipo.imei;
    return {
      tipo: 'dispositivo',
      equipo: m.equipo,
      clase: m.tipo,
      label: `${nombre} — ${estado}${extra} · ${horasTexto(horas)}`,
    };
  });
  const peso = { fuera: 0, espera: 1, apagado: 2 };
  items.sort((a, b) => peso[a.clase] - peso[b.clase] || a.label.localeCompare(b.label, 'es'));
  return { totalEquipos: equipos.length, items };
}

export function textoSeguimiento(items, { totalEquipos, cuentas, hasMore, hasPrev, page, totalPages }) {
  const fuera = cuentas.fuera;
  const espera = cuentas.espera;
  const apagado = cuentas.apagado;
  const lineas = [
    '*Resumen de seguimiento*',
    `Sigues *${totalEquipos}* equipo(s).`,
    `Fuera de rango: *${fuera}* · En espera: *${espera}* · Apagados: *${apagado}*`,
  ];
  if (!items.length) {
    lineas.push('', 'Ninguno está fuera de rango, en espera o apagado.', '', '*menu* abre la lista completa.');
    return lineas.join('\n');
  }
  let titulo = '';
  items.forEach((it, i) => {
    if (it.clase !== titulo) {
      titulo = it.clase;
      const cabeza = it.clase === 'fuera' ? 'Fuera de rango' : it.clase === 'espera' ? 'En espera' : 'Apagados';
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
