/**
 * Equipos visibles por WhatsApp = flota de la cuenta ZTRACK ligada al número
 * (groupIds + deviceAccess), más asignaciones explícitas en wa_asignacion.
 *
 * Las alertas push se deciden aparte (cuenta + grupo de correo) en cuenta.js.
 */
import { getUserByUsername, isSuperAdminUser } from '../usersRepository.js';
import {
  getGrupoEquipoById,
  listGruposEquipos,
  resolveUserEffectiveImeis,
} from '../gruposEquiposRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { getDeviceNameByRowKey } from '../deviceNamesRepository.js';
import { readJson } from '../store.js';
import { normalizarTelefono } from './telefono.js';
import { listarAsignaciones } from './repository.js';
import { excluidoDeWhatsapp } from './decisionFlota.js';
import {
  claveAsignacion,
  codigoDesdeRowKey,
  imeisDuplicadosEn,
  tokenCubreDispositivo,
} from '../asignacionEquipo.js';

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

/** Equipos de grupos de correo cuyo WhatsApp incluye este número. No abre la web. */
export function equiposAlertaWhatsappDeTelefono(telefono) {
  const n = normalizarTelefono(telefono);
  if (!n) return [];
  const grupos = readJson('grupos.json', []);
  const out = [];
  for (const g of grupos) {
    if (!g || g.enabled === false || g.whatsappActivo !== true) continue;
    const nums = Array.isArray(g.whatsappNumeros) ? g.whatsappNumeros : [];
    const esta = nums.some((x) => normalizarTelefono(x?.telefono) === n);
    if (!esta) continue;
    for (const d of g.devices || []) {
      if (!d || d.enabled === false || !d.imei) continue;
      out.push({
        imei: String(d.imei),
        rowKey: d.rowKey || null,
        codigo: d.codigo || null,
        nombre: nombreLimpio(d.nombrePlataforma) || nombreLimpio(d.descripcionEquipo),
        grupoId: g.id,
        grupoNombre: g.nombre,
        origen: 'alerta_whatsapp',
      });
    }
  }
  return out;
}

/**
 * Lista plana de equipos que el contacto puede consultar por chat.
 */
export async function equiposEfectivosDeContacto(contacto) {
  const flota = await loadCurrentDispositivos().catch(() => []);
  const dups = imeisDuplicadosEn(flota);
  const porClave = new Map();

  const add = (parcial) => {
    const imei = String(parcial?.imei || '').trim();
    if (!imei) return;
    let codigo = parcial.codigo || null;
    if (!codigo && parcial.rowKey) {
      const desde = codigoDesdeRowKey(parcial.rowKey, imei);
      if (desde) codigo = desde;
    }
    if (!codigo && dups.has(imei)) return;
    const clave = claveAsignacion(codigo, imei);
    const prev = porClave.get(clave) || {};
    porClave.set(clave, {
      imei,
      rowKey: parcial.rowKey || prev.rowKey || (codigo ? `${codigo}-${imei}` : null),
      codigo: codigo || prev.codigo || null,
      nombre: parcial.nombre || prev.nombre || null,
      grupoId: parcial.grupoId || prev.grupoId || null,
      grupoNombre: parcial.grupoNombre || prev.grupoNombre || null,
      origen: parcial.origen || prev.origen || 'cuenta',
    });
  };

  const agregarToken = (token, extra) => {
    const hits = flota.filter((d) => tokenCubreDispositivo(token, d, dups));
    if (hits.length) {
      for (const d of hits) {
        add({
          imei: d.imei,
          codigo: d.codigo,
          rowKey: d.codigo && d.imei ? `${d.codigo}-${d.imei}` : null,
          ...extra,
        });
      }
      return;
    }
    const t = String(token || '').trim();
    if (t.includes('|')) {
      const sep = t.indexOf('|');
      add({ codigo: t.slice(0, sep), imei: t.slice(sep + 1), ...extra });
      return;
    }
    if (t && !dups.has(t)) add({ imei: t, ...extra });
  };

  const nombreDeToken = (names, token) => {
    const t = String(token || '');
    return nombreLimpio(names[t] || names[t.split('|').pop() || '']);
  };

  // 1) Cuenta ZTRACK vinculada por username
  const user = contacto?.username ? getUserByUsername(contacto.username) : null;
  if (user) {
    const imeis = resolveUserEffectiveImeis(user);
    const names = user.deviceNames && typeof user.deviceNames === 'object' ? user.deviceNames : {};
    const groupIds = Array.isArray(user.groupIds) ? user.groupIds.map(String) : [];

    if (imeis === null && isSuperAdminUser(user)) {
      for (const d of flota) {
        add({
          imei: d.imei,
          codigo: d.codigo,
          rowKey: d.codigo && d.imei ? `${d.codigo}-${d.imei}` : null,
          origen: 'flota',
        });
      }
    } else if (imeis === null) {
      // Admin con flota completa: el chat no vuelca cientos de equipos.
    } else {
      for (const gid of groupIds) {
        const g = getGrupoEquipoById(gid);
        if (!g) continue;
        for (const token of g.imeis || []) {
          agregarToken(token, {
            nombre: nombreDeToken(names, token),
            grupoId: g.id,
            grupoNombre: g.nombre,
            origen: 'grupo_cuenta',
          });
        }
      }
      for (const token of imeis) {
        agregarToken(token, {
          nombre: nombreDeToken(names, token),
          origen: 'device_access',
        });
      }
    }
  }

  // 2) Números que el superadmin agregó a un grupo de alertas.
  for (const extra of equiposAlertaWhatsappDeTelefono(contacto?.telefono)) {
    const clave = claveAsignacion(extra.codigo || codigoDesdeRowKey(extra.rowKey, extra.imei), extra.imei);
    if (porClave.has(clave)) continue;
    add(extra);
  }

  // 3) Asignaciones explícitas WA (compat / override de nombre)
  const manual = await listarAsignaciones(contacto.id).catch(() => []);
  for (const e of manual) {
    add({
      ...e,
      origen: e.origen || 'wa_asignacion',
    });
  }

  // 4) Enriquecer con la flota ya cargada, por API + IMEI
  const byClave = new Map(flota.map((d) => [claveAsignacion(d.codigo, d.imei), d]));
  for (const e of porClave.values()) {
    const d = byClave.get(claveAsignacion(e.codigo, e.imei));
    if (!d) continue;
    e.codigo = e.codigo || d.codigo || null;
    e.rowKey = e.rowKey || `${d.codigo || 'EQ'}-${d.imei}`;
    const deCuenta = partirNombre(e.nombre, e.imei);
    const deServidor = partirNombre(getDeviceNameByRowKey(e.rowKey), e.imei);
    e.nombre = deCuenta.nombre || deServidor.nombre;
    e.celular = deCuenta.celular || deServidor.celular;
    e.estado_conexion = d.estado_conexion;
    e.ultimo_dato = d.ultimo_dato || null;
    e.ultima_actualizacion = d.ultima_actualizacion || null;
    e._flota = d;
  }

  for (const e of porClave.values()) {
    if (e.nombre && e.celular) continue;
    const deServidor = partirNombre(getDeviceNameByRowKey(e.rowKey), e.imei);
    if (!e.nombre) e.nombre = deServidor.nombre;
    if (!e.celular) e.celular = deServidor.celular;
  }

  return [...porClave.values()]
    .filter((e) => !excluidoDeWhatsapp(e.rowKey || (e.codigo && e.imei ? `${e.codigo}-${e.imei}` : '')))
    .sort((a, b) => etiqueta(a).localeCompare(etiqueta(b), 'es'));
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
  const dups = imeisDuplicadosEn(planos);
  const claveDe = (e) => claveAsignacion(e.codigo, e.imei);

  for (const gid of groupIds) {
    const g = getGrupoEquipoById(gid) || listGruposEquipos().find((x) => x.id === gid);
    if (!g) continue;
    const dispositivos = planos.filter((e) => {
      if (String(e.grupoId) === String(g.id)) return true;
      return (g.imeis || []).some((token) => tokenCubreDispositivo(token, e, dups));
    });
    dispositivos.forEach((d) => enGrupo.add(claveDe(d)));
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
    if (enGrupo.has(claveDe(e))) continue;
    if (e.grupoNombre) {
      if (!porNombreExtra.has(e.grupoNombre)) porNombreExtra.set(e.grupoNombre, []);
      porNombreExtra.get(e.grupoNombre).push(e);
      enGrupo.add(claveDe(e));
    }
  }
  for (const [nombre, dispositivos] of porNombreExtra) {
    grupos.push({
      id: `nombre:${nombre}`,
      nombre,
      dispositivos,
    });
  }

  const individuales = planos.filter((e) => !enGrupo.has(claveDe(e)));
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
