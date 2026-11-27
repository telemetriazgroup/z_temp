import { query } from '../db.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { getDeviceNameByRowKey } from '../deviceNamesRepository.js';
import { getUserByUsername, isSuperAdminUser } from '../usersRepository.js';

export function esContactoSuperadmin(contacto) {
  const user = contacto?.username ? getUserByUsername(contacto.username) : null;
  return isSuperAdminUser(user);
}

function estadoDe(d) {
  return String(d?.estado_conexion ?? 'offline').toLowerCase();
}

function nombreDe(d) {
  const rowKey = d?.codigo && d?.imei ? `${d.codigo}-${d.imei}` : null;
  const guardado = getDeviceNameByRowKey(rowKey);
  const limpio = String(guardado || d?.descripcion || d?.nombre || '').trim();
  if (!limpio || limpio.toUpperCase() === 'SIN ASIGNAR' || limpio === String(d?.imei)) {
    return d?.imei || 'Sin nombre';
  }
  return limpio;
}

function horasTexto(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${Math.round(h * 10) / 10} h`;
}

export async function resumenFlota() {
  const filas = await loadCurrentDispositivos().catch(() => []);
  const rank = { online: 4, wait: 3, offline: 2, historial: 1 };
  const porEquipo = new Map();
  for (const d of filas) {
    const imei = String(d?.imei || '').trim();
    if (!imei) continue;
    const k = `${String(d?.codigo || '').toUpperCase()}|${imei}`;
    const prev = porEquipo.get(k);
    if (!prev || (rank[estadoDe(d)] ?? 0) > (rank[estadoDe(prev)] ?? 0)) porEquipo.set(k, d);
  }
  const flota = [...porEquipo.values()];
  const cuentas = { online: 0, wait: 0, offline: 0, historial: 0, otros: 0 };
  const enLinea = [];
  for (const d of flota) {
    const e = estadoDe(d);
    if (e === 'online' || e === 'wait' || e === 'offline' || e === 'historial') cuentas[e] += 1;
    else cuentas.otros += 1;
    if (e === 'online') enLinea.push(d);
  }
  enLinea.sort((a, b) => {
    const an = nombreDe(a) === String(a.imei) ? 1 : 0;
    const bn = nombreDe(b) === String(b.imei) ? 1 : 0;
    if (an !== bn) return an - bn;
    return nombreDe(a).localeCompare(nombreDe(b), 'es');
  });
  return {
    total: flota.length,
    cuentas,
    primerosOnline: enLinea.slice(0, 8).map(nombreDe),
    flota,
  };
}

export async function cambiosUltimaHora() {
  const r = await query(
    `SELECT imei, lower(estado_conexion) AS estado, captured_at
     FROM dashboard_device_sample
     WHERE captured_at >= now() - interval '70 minutes'
     ORDER BY imei, captured_at`
  );
  const por = new Map();
  for (const row of r.rows) {
    if (!por.has(row.imei)) por.set(row.imei, []);
    por.get(row.imei).push(row);
  }
  const corte = Date.now() - 60 * 60 * 1000;
  const aWait = new Set();
  const aOff = new Set();
  for (const [imei, rows] of por) {
    for (let i = 1; i < rows.length; i += 1) {
      const cuando = new Date(rows[i].captured_at).getTime();
      if (cuando < corte) continue;
      const prev = rows[i - 1].estado;
      const ahora = rows[i].estado;
      if (prev === 'online' && ahora === 'wait') aWait.add(imei);
      if (prev === 'wait' && ahora === 'offline') aOff.add(imei);
    }
  }
  return { onlineAWait: aWait.size, waitAOffline: aOff.size };
}

export async function fueraDeRangoMasDe2h() {
  const r = await query(
    `SELECT imei, codigo, rango_estado, captured_at
     FROM dashboard_device_sample
     WHERE captured_at >= now() - interval '7 days'
       AND rango_estado IS NOT NULL
     ORDER BY imei, captured_at DESC`
  );
  const por = new Map();
  for (const row of r.rows) {
    if (!por.has(row.imei)) por.set(row.imei, []);
    por.get(row.imei).push(row);
  }
  const flota = await loadCurrentDispositivos().catch(() => []);
  const porImei = new Map(flota.map((d) => [String(d.imei), d]));
  const lista = [];
  const ahora = Date.now();
  for (const [imei, rows] of por) {
    if (String(rows[0].rango_estado) !== 'fuera') continue;
    let desde = new Date(rows[0].captured_at).getTime();
    let cortoEnVentana = false;
    for (const row of rows) {
      if (String(row.rango_estado) !== 'fuera') {
        cortoEnVentana = true;
        break;
      }
      desde = new Date(row.captured_at).getTime();
    }
    const horas = (ahora - desde) / 3600000;
    if (horas < 2 && cortoEnVentana) continue;
    if (horas < 2 && !cortoEnVentana) continue;
    const d = porImei.get(String(imei));
    lista.push({
      nombre: nombreDe(d || { imei, codigo: rows[0].codigo }),
      horas,
      abierto: !cortoEnVentana,
    });
  }
  lista.sort((a, b) => a.horas - b.horas);
  return lista;
}

export function textoMenuGeneral({ cuentas, total, primerosOnline, cambios }) {
  const lineas = [
    '*General ZTRACK*',
    `Flota: *${total}* equipos`,
    `En línea: *${cuentas.online}*`,
    `Wait: *${cuentas.wait}*`,
    `Offline: *${cuentas.offline}*`,
  ];
  if (cuentas.historial) lineas.push(`Sin enlace reciente: *${cuentas.historial}*`);
  lineas.push('', 'Primeros 8 en línea:');
  if (!primerosOnline.length) lineas.push('Ninguno en línea ahora.');
  else primerosOnline.forEach((n, i) => lineas.push(`${i + 1}. ${n}`));
  lineas.push(
    '',
    'Última hora:',
    `De online a wait: *${cambios.onlineAWait}*`,
    `De wait a offline: *${cambios.waitAOffline}*`,
    '',
    '1 - Ver equipos',
    '2 - Fuera de rango, más de 2 h',
    '3 - Actualizar general',
    '',
    'Escribe *general* cuando quieras este resumen otra vez.'
  );
  return lineas.join('\n');
}

export function textoFueraDeRango(lista) {
  if (!lista.length) {
    return 'No veo equipos fuera de rango por más de 2 horas.';
  }
  const top = lista.slice(0, 12);
  const lineas = [`*Fuera de rango, más de 2 h* (${lista.length})`, ''];
  for (const it of top) {
    const extra = it.abierto ? ' o más' : '';
    lineas.push(`• ${it.nombre} — *${horasTexto(it.horas)}${extra}*`);
  }
  if (lista.length > top.length) lineas.push(`… y ${lista.length - top.length} más.`);
  lineas.push('', '1 - Ver equipos', '2 - Fuera de rango, más de 2 h', '3 - Actualizar general');
  return lineas.join('\n');
}
