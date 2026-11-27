import express from 'express';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { fetchHistorialRango } from '../historicalTelemetry.js';
import { filterDispositivosForUser } from '../dashboard/snapshot.js';
import {
  getUserById,
  getUserByUsername,
  getUsers,
  isSuperAdminUser,
  resolveUserCategory,
} from '../usersRepository.js';
import { appendAuditEvent } from '../auditLogRepository.js';
import { claveDesdeSolicitud, cupoSolicitud, ipCliente, ipPermitida } from './acceso.js';
import {
  buscarPorClave,
  crearDemo,
  estadoDemo,
  guardarIps,
  habilitarCuenta,
  leerCuenta,
  listarDemos,
  marcarUso,
  revocarCuenta,
  revocarDemo,
  rotarClave,
  vistaPublica,
} from './repositorio.js';
import { guiaEstructurada, guiaMarkdown } from './guia.js';
import { origenCanonico, presentarEquipo, marcaDe, resumirFlota, serieHistorial, ventanaHistorial } from './presentar.js';
import { deviceRowKey } from '../telemetry.js';
import { getDeviceNameByRowKey } from '../deviceNamesRepository.js';

const IMEI_RE = /^\d{10,20}$/;

function nombreCuenta(user) {
  const explicito = String(user?.displayName || '').trim();
  if (explicito) return explicito;
  const completo = [user?.nombres, user?.apellidos].filter(Boolean).join(' ').trim();
  return completo || user?.username || '';
}

function flotaCompleta(user) {
  return (
    isSuperAdminUser(user) ||
    (Array.isArray(user?.deviceAccess) && user.deviceAccess.includes('all'))
  );
}

function auditoria(actor, event) {
  appendAuditEvent({
    actorUsername: actor.username,
    actorId: actor.id,
    module: 'api-externa',
    ...event,
  });
}

export function createApiExternaAdminRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    const username = String(req.headers['x-ztrack-user'] || '').trim();
    const actor = username ? getUserByUsername(username) : null;
    if (!actor || !isSuperAdminUser(actor)) {
      res.status(403).json({ ok: false, error: 'Solo el superadmin administra la API externa' });
      return;
    }
    req.apiActor = actor;
    next();
  });

  router.get('/cuentas', (_req, res) => {
    const cuentas = getUsers()
      .map((user) => {
        const acceso = vistaPublica(leerCuenta(user.id));
        return {
          id: user.id,
          username: user.username,
          nombre: nombreCuenta(user),
          category: resolveUserCategory(user),
          flotaCompleta: flotaCompleta(user),
          ...acceso,
        };
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.username.localeCompare(b.username));
    res.json({ ok: true, data: cuentas });
  });

  router.post('/cuentas/:userId/habilitar', (req, res) => {
    try {
      const user = getUserById(req.params.userId);
      if (!user) {
        res.status(404).json({ ok: false, error: 'La cuenta no existe' });
        return;
      }
      const { clave, cuenta } = habilitarCuenta(user.id);
      auditoria(req.apiActor, {
        action: 'api_externa_habilitar',
        summary: `Habilitó la API externa de ${user.username}`,
        targetUsername: user.username,
        targetId: user.id,
        detail: { prefix: cuenta.prefix },
      });
      res.json({
        ok: true,
        clave,
        data: { id: user.id, username: user.username, ...cuenta },
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e?.message ?? 'No se pudo habilitar' });
    }
  });

  router.post('/cuentas/:userId/rotar', (req, res) => {
    try {
      const user = getUserById(req.params.userId);
      if (!user) {
        res.status(404).json({ ok: false, error: 'La cuenta no existe' });
        return;
      }
      const { clave, cuenta } = rotarClave(user.id);
      auditoria(req.apiActor, {
        action: 'api_externa_rotar',
        summary: `Rotó la clave de API externa de ${user.username}`,
        targetUsername: user.username,
        targetId: user.id,
        detail: { prefix: cuenta.prefix },
      });
      res.json({ ok: true, clave, data: { id: user.id, username: user.username, ...cuenta } });
    } catch (e) {
      res.status(400).json({ ok: false, error: e?.message ?? 'No se pudo rotar la clave' });
    }
  });

  router.post('/cuentas/:userId/revocar', (req, res) => {
    const user = getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ ok: false, error: 'La cuenta no existe' });
      return;
    }
    const cuenta = revocarCuenta(user.id);
    auditoria(req.apiActor, {
      action: 'api_externa_revocar',
      summary: `Revocó la API externa de ${user.username}`,
      targetUsername: user.username,
      targetId: user.id,
    });
    res.json({ ok: true, data: { id: user.id, username: user.username, ...cuenta } });
  });

  router.put('/cuentas/:userId/ips', (req, res) => {
    try {
      const user = getUserById(req.params.userId);
      if (!user) {
        res.status(404).json({ ok: false, error: 'La cuenta no existe' });
        return;
      }
      const cuenta = guardarIps(user.id, req.body?.ips ?? '');
      auditoria(req.apiActor, {
        action: 'api_externa_ips',
        summary: `Actualizó las IP permitidas de ${user.username}`,
        targetUsername: user.username,
        targetId: user.id,
        detail: { allowIps: cuenta.allowIps },
      });
      res.json({ ok: true, data: { id: user.id, username: user.username, ...cuenta } });
    } catch (e) {
      res.status(400).json({ ok: false, error: e?.message ?? 'No se pudieron guardar las IP' });
    }
  });

  router.get('/flota', async (_req, res) => {
    try {
      const flota = await loadCurrentDispositivos();
      const data = flota
        .map((d) => {
          const origen = origenCanonico(d.codigo);
          if (!origen || !IMEI_RE.test(String(d.imei || ''))) return null;
          const rowKey = deviceRowKey(d);
          return {
            imei: String(d.imei),
            origen,
            marca: marcaDe(origen),
            nombre: getDeviceNameByRowKey(rowKey) || null,
            conexion: d.estado_conexion ?? null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.nombre || a.imei).localeCompare(String(b.nombre || b.imei), 'es'));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(503).json({ ok: false, error: 'La flota no está disponible en este momento' });
      console.error('[api-externa] flota', e?.message ?? e);
    }
  });

  router.get('/demos', (_req, res) => {
    res.json({ ok: true, data: listarDemos() });
  });

  router.post('/demos', async (req, res) => {
    try {
      const flota = await loadCurrentDispositivos();
      const pedidos = Array.isArray(req.body?.equipos) ? req.body.equipos : [];
      const inexistentes = [];
      for (const item of pedidos) {
        const origen = origenCanonico(item?.origen || item?.codigo);
        const imei = String(item?.imei || '').trim();
        const existe = flota.some(
          (d) => String(d.imei) === imei && origenCanonico(d.codigo) === origen
        );
        if (origen && imei && !existe) inexistentes.push(`${origen} ${imei}`);
      }
      if (inexistentes.length) {
        res.status(400).json({
          ok: false,
          error: `Equipo no encontrado: ${inexistentes.slice(0, 3).join(', ')}`,
        });
        return;
      }
      const { clave, demo } = crearDemo({
        nombre: req.body?.nombre,
        motivo: req.body?.motivo,
        duracionValor: req.body?.duracionValor,
        duracionUnidad: req.body?.duracionUnidad,
        equipos: pedidos,
      });
      auditoria(req.apiActor, {
        action: 'api_externa_demo',
        summary: `Creó la demo «${demo.nombre}» por ${demo.duracionValor} ${demo.duracionUnidad}`,
        targetId: demo.id,
        detail: { equipos: demo.equipos.length, venceEn: demo.venceEn, motivo: demo.motivo },
      });
      res.json({ ok: true, clave, data: demo });
    } catch (e) {
      res.status(400).json({ ok: false, error: e?.message ?? 'No se pudo crear la demo' });
    }
  });

  router.post('/demos/:id/revocar', (req, res) => {
    try {
      const demo = revocarDemo(req.params.id);
      auditoria(req.apiActor, {
        action: 'api_externa_demo_revocar',
        summary: `Revocó la demo «${demo.nombre}»`,
        targetId: demo.id,
      });
      res.json({ ok: true, data: demo });
    } catch (e) {
      res.status(400).json({ ok: false, error: e?.message ?? 'No se pudo revocar la demo' });
    }
  });

  router.get('/guia', (req, res) => {
    const base = basePublica(req);
    if (String(req.query.formato || '') === 'texto') {
      res.type('text/markdown; charset=utf-8').send(guiaMarkdown(base));
      return;
    }
    res.json({ ok: true, ...guiaEstructurada(base) });
  });

  return router;
}

function rechazar(res, status, error, extra = {}) {
  res.status(status).json({ ok: false, error, ...extra });
}

function basePublica(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}/reefer/api/v1`;
}

async function exigirClave(req, res, { historial = false } = {}) {
  const encontrada = buscarPorClave(claveDesdeSolicitud(req));
  if (!encontrada) {
    rechazar(res, 401, 'Clave no válida');
    return null;
  }
  if (encontrada.tipo === 'demo') {
    const estado = estadoDemo(encontrada.demo);
    if (estado === 'vencida') {
      rechazar(res, 401, 'La conexión demo venció');
      return null;
    }
    if (estado !== 'vigente') {
      rechazar(res, 401, 'Clave no válida');
      return null;
    }
  } else if (encontrada.cuenta?.enabled !== true || !encontrada.cuenta.keyHash) {
    rechazar(res, 401, 'Clave no válida');
    return null;
  }
  const user = encontrada.tipo === 'cuenta' ? getUserById(encontrada.id) : null;
  if (encontrada.tipo === 'cuenta' && !user) {
    rechazar(res, 401, 'Clave no válida');
    return null;
  }
  const ip = ipCliente(req);
  const reglas = encontrada.tipo === 'cuenta' ? encontrada.cuenta.allowIps : [];
  if (!ipPermitida(ip, reglas)) {
    rechazar(res, 403, 'Esta dirección no está autorizada para la clave');
    return null;
  }
  const cupo = cupoSolicitud(encontrada.id, { historial });
  if (!cupo.ok) {
    res.setHeader('Retry-After', String(cupo.espera));
    rechazar(res, 429, 'Demasiadas solicitudes. Espere un momento.', {
      reintentar_en_segundos: cupo.espera,
    });
    return null;
  }
  marcarUso(encontrada.tipo, encontrada.id);
  return encontrada.tipo === 'demo'
    ? { tipo: 'demo', id: encontrada.id, demo: encontrada.demo, user: null }
    : { tipo: 'cuenta', id: user.id, demo: null, user };
}

async function equiposDeAcceso(acceso) {
  const flota = await loadCurrentDispositivos();
  if (acceso.tipo === 'demo') {
    const permitidos = new Set(
      (acceso.demo.equipos || []).map((e) => `${e.origen}|${e.imei}`)
    );
    return flota.filter((d) => permitidos.has(`${origenCanonico(d.codigo)}|${d.imei}`));
  }
  return filterDispositivosForUser(flota, acceso.user);
}

function metaAcceso(acceso) {
  if (acceso.tipo !== 'demo') {
    return { tipo: 'cuenta', cuenta: acceso.user.username };
  }
  return {
    tipo: 'demo',
    nombre: acceso.demo.nombre,
    motivo: acceso.demo.motivo,
    vence_en: acceso.demo.venceEn,
  };
}

function buscarEquipo(flota, origen, imei) {
  return (
    flota.find(
      (d) => String(d.imei) === imei && origenCanonico(d.codigo) === origen
    ) ?? null
  );
}

export function createApiExternaPublicRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Api-Key, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET') {
      rechazar(res, 405, 'Esta API solo permite lectura');
      return;
    }
    next();
  });

  router.get('/guia', (req, res) => {
    const base = basePublica(req);
    if (String(req.query.formato || '') === 'texto') {
      res.type('text/markdown; charset=utf-8');
      res.send(guiaMarkdown(base));
      return;
    }
    res.json({ ok: true, ...guiaEstructurada(base) });
  });

  router.get('/', async (req, res) => {
    const acceso = await exigirClave(req, res);
    if (!acceso) return;
    res.json({
      ok: true,
      ...metaAcceso(acceso),
      zona_horaria: 'America/Lima',
      guia: '/reefer/api/v1/guia',
      limites: {
        historial_max_horas: 168,
        solicitudes_por_minuto: 120,
        historiales_por_minuto: 30,
      },
      recursos: {
        equipos: 'GET /reefer/api/v1/equipos',
        equipo: 'GET /reefer/api/v1/equipos/{origen}/{imei}',
        historial: 'GET /reefer/api/v1/equipos/{origen}/{imei}/historial?horas=12',
      },
    });
  });

  router.get('/equipos', async (req, res) => {
    const acceso = await exigirClave(req, res);
    if (!acceso) return;
    try {
      const equipos = (await equiposDeAcceso(acceso)).map(presentarEquipo);
      res.json({
        ok: true,
        ...metaAcceso(acceso),
        zona_horaria: 'America/Lima',
        resumen: resumirFlota(equipos),
        equipos,
      });
    } catch (e) {
      rechazar(res, 503, 'La flota no está disponible en este momento');
      console.error('[api-externa] equipos', e?.message ?? e);
    }
  });

  router.get('/equipos/:origen/:imei', async (req, res) => {
    const acceso = await exigirClave(req, res);
    if (!acceso) return;
    const origen = origenCanonico(req.params.origen);
    const imei = String(req.params.imei || '').trim();
    if (!origen || !IMEI_RE.test(imei)) {
      rechazar(res, 400, 'Origen o IMEI no válido');
      return;
    }
    try {
      const equipo = buscarEquipo(await equiposDeAcceso(acceso), origen, imei);
      if (!equipo) {
        rechazar(res, 404, 'Equipo no disponible para esta cuenta');
        return;
      }
      res.json({ ok: true, ...metaAcceso(acceso), equipo: presentarEquipo(equipo) });
    } catch (e) {
      rechazar(res, 503, 'La flota no está disponible en este momento');
      console.error('[api-externa] equipo', e?.message ?? e);
    }
  });

  router.get('/equipos/:origen/:imei/historial', async (req, res) => {
    const acceso = await exigirClave(req, res, { historial: true });
    if (!acceso) return;
    const origen = origenCanonico(req.params.origen);
    const imei = String(req.params.imei || '').trim();
    if (!origen || !IMEI_RE.test(imei)) {
      rechazar(res, 400, 'Origen o IMEI no válido');
      return;
    }
    let ventana;
    try {
      ventana = ventanaHistorial(req.query);
    } catch (e) {
      rechazar(res, e.status || 400, e.message || 'Rango inválido');
      return;
    }
    try {
      const equipo = buscarEquipo(await equiposDeAcceso(acceso), origen, imei);
      if (!equipo) {
        rechazar(res, 404, 'Equipo no disponible para esta cuenta');
        return;
      }
      const crudo = await fetchHistorialRango(origen, imei, ventana.desde, ventana.hasta);
      const serie = serieHistorial(crudo?.datos, origen);
      res.json({
        ok: true,
        ...metaAcceso(acceso),
        zona_horaria: 'America/Lima',
        equipo: {
          imei,
          origen,
          nombre: presentarEquipo(equipo).nombre,
        },
        desde: ventana.desde.toISOString(),
        hasta: ventana.hasta.toISOString(),
        total: serie.total,
        recortado: serie.recortado,
        puntos: serie.puntos,
      });
    } catch (e) {
      rechazar(res, 502, 'No se pudo leer el historial de ese equipo');
      console.error('[api-externa] historial', e?.message ?? e);
    }
  });

  return router;
}
