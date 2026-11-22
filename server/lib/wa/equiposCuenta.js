/**
 * Equipos visibles por WhatsApp = flota de la cuenta ZTRACK ligada al número
 * (groupIds + deviceAccess), más asignaciones explícitas en wa_asignacion.
 *
 * Las alertas push se deciden aparte (cuenta + grupo de correo) en cuenta.js.
 */
import { getUserByUsername } from '../usersRepository.js';
import {
  getGrupoEquipoById,
  listGruposEquipos,
  resolveUserEffectiveImeis,
} from '../gruposEquiposRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { getDeviceNameByImei, getDeviceNameByRowKey } from '../deviceNamesRepository.js';
import { listarAsignaciones } from './repository.js';

function nombreLimpio(value) {
  const s = String(value ?? '').trim();
  if (!s || s.toUpperCase() === 'SIN ASIGNAR') return null;
  return s;
}

/** Separa el nombre visible del celular de 9 dígitos que suele ir al final. */
export function partirNombre(raw, imei) {
  const s = nombreLimpio(raw);
  if (!s || s === String(imei || '')) return { nombre: null, celular: null };
  const m = s.match(/^(.*?)(?:[\s.]+)(9\d{8})\s*$/);
  if (m) {
    const nombre = m[1].replace(/[.\s]+$/, '').trim();
    return { nombre: nombre && nombre !== String(imei) ? nombre : null, celular: m[2] };
  }
  if (/^9\d{8}$/.test(s)) return { nombre: null, celular: s };
  return { nombre: s, celular: null };
}

function etiqueta(e) {
  return String(e?.nombre || 'Sin asignar').trim();
}

/**
 * Lista plana de equipos que el contacto puede consultar por chat.
 */
export async function equiposEfectivosDeContacto(contacto) {
  const porImei = new Map();

  const add = (parcial) => {
    const imei = String(parcial?.imei || '').trim();
    if (!imei) return;
    const prev = porImei.get(imei) || {};
    porImei.set(imei, {
      imei,
      rowKey: parcial.rowKey || prev.rowKey || null,
      codigo: parcial.codigo || prev.codigo || null,
      nombre: parcial.nombre || prev.nombre || null,
      grupoId: parcial.grupoId || prev.grupoId || null,
      grupoNombre: parcial.grupoNombre || prev.grupoNombre || null,
      origen: parcial.origen || prev.origen || 'cuenta',
    });
  };

  // 1) Cuenta ZTRACK vinculada por username
  const user = contacto?.username ? getUserByUsername(contacto.username) : null;
  if (user) {
    const imeis = resolveUserEffectiveImeis(user);
    const names = user.deviceNames && typeof user.deviceNames === 'object' ? user.deviceNames : {};
    const groupIds = Array.isArray(user.groupIds) ? user.groupIds.map(String) : [];

    if (imeis === null) {
      // Acceso total: no volcamos toda la flota al chat; solo wa_asignacion + grupos si hay
    } else {
      for (const gid of groupIds) {
        const g = getGrupoEquipoById(gid);
        if (!g) continue;
        for (const imei of g.imeis || []) {
          add({
            imei,
            nombre: nombreLimpio(names[imei]),
            grupoId: g.id,
            grupoNombre: g.nombre,
            origen: 'grupo_cuenta',
          });
        }
      }
      for (const imei of imeis) {
        if (porImei.has(String(imei))) continue;
        add({
          imei,
          nombre: nombreLimpio(names[imei]),
          origen: 'device_access',
        });
      }
    }
  }

  // 2) Asignaciones explícitas WA (compat / override de nombre)
  const manual = await listarAsignaciones(contacto.id).catch(() => []);
  for (const e of manual) {
    add({
      ...e,
      origen: e.origen || 'wa_asignacion',
    });
  }

  // 3) Enriquecer con flota actual (nombre, codigo, estado)
  const flota = await loadCurrentDispositivos().catch(() => []);
  const byImei = new Map(flota.map((d) => [String(d.imei), d]));
  for (const e of porImei.values()) {
    const d = byImei.get(String(e.imei));
    if (!d) continue;
    e.codigo = e.codigo || d.codigo || null;
    e.rowKey = e.rowKey || `${d.codigo || 'EQ'}-${d.imei}`;
    const deCuenta = partirNombre(e.nombre, e.imei);
    const deServidor = partirNombre(getDeviceNameByRowKey(e.rowKey) || getDeviceNameByImei(e.imei), e.imei);
    e.nombre = deCuenta.nombre || deServidor.nombre;
    e.celular = deCuenta.celular || deServidor.celular;
    e.estado_conexion = d.estado_conexion;
    e.ultimo_dato = d.ultimo_dato || null;
    e.ultima_actualizacion = d.ultima_actualizacion || null;
    e._flota = d;
  }

  for (const e of porImei.values()) {
    if (e.nombre && e.celular) continue;
    const deServidor = partirNombre(getDeviceNameByRowKey(e.rowKey) || getDeviceNameByImei(e.imei), e.imei);
    if (!e.nombre) e.nombre = deServidor.nombre;
    if (!e.celular) e.celular = deServidor.celular;
  }

  return [...porImei.values()].sort((a, b) =>
    etiqueta(a).localeCompare(etiqueta(b), 'es')
  );
}

/**
 * Agrupa para menú WA: grupos de la cuenta + individuales.
 */
export async function equiposOrganizadosDeContacto(contacto) {
  const planos = await equiposEfectivosDeContacto(contacto);
  const user = contacto?.username ? getUserByUsername(contacto.username) : null;
  const groupIds = Array.isArray(user?.groupIds) ? user.groupIds.map(String) : [];

  const grupos = [];
  const enGrupo = new Set();

  for (const gid of groupIds) {
    const g = getGrupoEquipoById(gid) || listGruposEquipos().find((x) => x.id === gid);
    if (!g) continue;
    const dispositivos = planos.filter((e) => {
      if (String(e.grupoId) === String(g.id)) return true;
      if ((g.imeis || []).map(String).includes(String(e.imei))) return true;
      return false;
    });
    dispositivos.forEach((d) => enGrupo.add(String(d.imei)));
    grupos.push({
      id: g.id,
      nombre: g.nombre,
      dispositivos: dispositivos.map((d) => ({
        ...d,
        grupoId: g.id,
        grupoNombre: g.nombre,
      })),
    });
  }

  // Si hay planos con grupoNombre pero sin groupIds (solo wa_asignacion), agrupar por nombre
  const porNombreExtra = new Map();
  for (const e of planos) {
    if (enGrupo.has(String(e.imei))) continue;
    if (e.grupoNombre) {
      if (!porNombreExtra.has(e.grupoNombre)) porNombreExtra.set(e.grupoNombre, []);
      porNombreExtra.get(e.grupoNombre).push(e);
      enGrupo.add(String(e.imei));
    }
  }
  for (const [nombre, dispositivos] of porNombreExtra) {
    grupos.push({
      id: `nombre:${nombre}`,
      nombre,
      dispositivos,
    });
  }

  const individuales = planos.filter((e) => !enGrupo.has(String(e.imei)));
  return { grupos, individuales, planos };
}

export function filtrarEquipos(planos, query) {
  const q = String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!q) return [];
  const qCompact = q.replace(/[\s\-_]/g, '');
  const digits = q.replace(/\D/g, '');

  return planos.filter((e) => {
    const nom = String(e.nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const nomC = nom.replace(/[\s\-_]/g, '');
    const imei = String(e.imei || '');
    if (nom.includes(q) || nomC.includes(qCompact)) return true;
    if (qCompact.startsWith('zgru') && nomC.includes(qCompact)) return true;
    if (digits.length >= 4 && (imei.includes(digits) || nom.replace(/\D/g, '').includes(digits))) {
      return true;
    }
    if (digits.length >= 4 && String(e.celular || '').includes(digits)) return true;
    const tokens = q.split(/[\s\-_]+/).filter((t) => t.length >= 3);
    if (tokens.length && tokens.every((t) => nom.includes(t) || nomC.includes(t))) return true;
    return tokens.some((t) => nom.includes(t));
  });
}

export { etiqueta };
