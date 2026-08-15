import express from 'express';
import nodemailer from 'nodemailer';
import {
  readJson,
  writeJson,
  uid,
  todayKey,
  yesterdayKey,
} from './lib/store.js';
import {
  runAlertCycle,
  getLastRun,
  getGrupos,
  getEnvios,
  getIncidentes,
  listCiclos,
  getCicloById,
  getAlertStateView,
  refreshDeviceReferenceFromHistorial,
  applyManualDeviceReference,
  archiveIncidente,
  archiveAllIncidentes,
  getDeviceEventosView,
} from './lib/alertEngine.js';
import { getSmtpConfig, saveSmtpConfig, smtpPublicView } from './lib/smtpRepository.js';
import {
  filterGruposForActor,
  validateAndNormalizeGrupoSave,
  grupoOwnedBy,
  actorMayAccessImei,
} from './lib/correoPermissions.js';
import { mergeDeviceNames, getDeviceNameByImei, getDeviceNamesView, setDeviceName, getDeviceNameHistory } from './lib/deviceNamesRepository.js';
import {
  getDeviceAlertConfigMap,
  saveDeviceAlertConfig,
} from './lib/deviceAlertConfigRepository.js';
import { buildFueraDeRangoEmail } from './lib/emailBuilder.js';
import {
  ensureUserRegistry,
  getUsersPublic,
  authenticate,
  addUser,
  updateUser,
  deleteUser,
  migrateUsersFromClient,
  getUserByUsername,
  getUserByIdPublic,
  updateOwnProfile,
  listUsersForActor,
  canManageUsers,
  canAccessAudit,
  isSuperAdminUser,
  publicUserView,
} from './lib/usersRepository.js';
import {
  appendAuditEvent,
  listAuditEvents,
  listAuditActionCatalog,
} from './lib/auditLogRepository.js';
import {
  listEmpresas,
  getEmpresaById,
  addEmpresa,
  updateEmpresa,
  deleteEmpresa,
  assignUserEmpresa,
  listUsersByEmpresa,
} from './lib/empresasRepository.js';
import {
  listGruposEquipos,
  getGrupoEquipoById,
  addGrupoEquipo,
  updateGrupoEquipo,
  deleteGrupoEquipo,
} from './lib/gruposEquiposRepository.js';
import {
  getAyudaSoporte,
  saveAyudaSoporte,
} from './lib/ayudaSoporteRepository.js';

import { createAnalisisRouter } from './lib/analisis/routes.js';
import { createDashboardRouter } from './lib/dashboard/routes.js';
import { ensureAnalisisSchema } from './lib/db.js';
import { captureDashboardSnapshotSafe } from './lib/dashboard/snapshot.js';
import { buildExternalAlertMonitor } from './lib/externalAlertMonitor.js';

const PORT = Number(process.env.CORREO_PORT ?? 3003);
const POLL_MS = Number(process.env.CORREO_POLL_MS ?? 2 * 60 * 1000);
const DASHBOARD_SNAPSHOT_MS = Number(
  process.env.DASHBOARD_SNAPSHOT_MS ?? Math.max(POLL_MS, 5 * 60 * 1000)
);
/** Si está definido, la ruta externa exige header `x-api-key` o `?apiKey=`. */
const EXTERNAL_API_KEY = process.env.CORREO_EXTERNAL_API_KEY?.trim() || '';
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use('/reefer/api/analisis', createAnalisisRouter());
app.use('/reefer/api/correo/dashboard', createDashboardRouter());

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function getUser(req) {
  return (
    req.headers['x-ztrack-user']?.toString().trim() ||
    req.body?.usuario?.toString().trim() ||
    'sistema'
  );
}

function resolveActor(req) {
  const username = getUser(req);
  if (!username || username === 'sistema') return null;
  ensureUserRegistry();
  return getUserByUsername(username) ?? null;
}

function isSuperUserRequest(req) {
  const actor = resolveActor(req);
  if (actor && isSuperAdminUser(actor)) return true;
  return req.headers['x-ztrack-super-user']?.toString().toLowerCase() === 'true';
}

function requireSuperUser(req, res) {
  const actor = resolveActor(req);
  if (actor && isSuperAdminUser(actor)) return true;
  if (!isSuperUserRequest(req)) {
    res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    return false;
  }
  return true;
}

function requireUserManager(req, res) {
  const actor = resolveActor(req);
  if (!actor || !canManageUsers(actor)) {
    res.status(403).json({ ok: false, error: 'Se requiere admin o superadmin' });
    return false;
  }
  return actor;
}

function requireAuditAccess(req, res) {
  const actor = resolveActor(req);
  if (!actor || !canAccessAudit(actor)) {
    res.status(403).json({ ok: false, error: 'Se requiere superadmin para auditoría' });
    return false;
  }
  return actor;
}

function auditSafeDetail(obj) {
  if (obj == null || typeof obj !== 'object') return undefined;
  const clone = { ...obj };
  delete clone.password;
  delete clone.currentPassword;
  delete clone.newPassword;
  delete clone.appPassword;
  return clone;
}

function auditActorEvent(req, event) {
  try {
    const actor = resolveActor(req);
    appendAuditEvent({
      actorUsername: actor?.username ?? getUser(req),
      actorId: actor?.id,
      ...event,
      detail: auditSafeDetail(event.detail),
    });
  } catch {
    // no bloquear la operación principal
  }
}

function requireExternalApiKey(req, res) {
  if (!EXTERNAL_API_KEY) return true;
  const provided =
    req.headers['x-api-key']?.toString().trim() ||
    req.query.apiKey?.toString().trim() ||
    '';
  if (provided !== EXTERNAL_API_KEY) {
    res.status(401).json({
      ok: false,
      error: 'API key inválida o ausente (header x-api-key)',
    });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ztrack-correo', pollMs: POLL_MS });
});

app.get('/reefer/api/correo/status', (_req, res) => {
  const smtp = getSmtpConfig();
  const grupos = getGrupos();
  res.json({
    ok: true,
    smtpConfigured: Boolean(smtp?.user && smtp?.appPassword),
    smtpUpdatedAt: smtp?.updatedAt ?? null,
    gruposActivos: grupos.filter((g) => g.enabled).length,
    lastRun: getLastRun(),
    incidentesPendientes: getIncidentes().filter(
      (i) => i.estado === 'pendiente' && i.archivado !== true
    ).length,
  });
});

app.get('/reefer/api/correo/ayuda-soporte', (_req, res) => {
  try {
    res.json({ ok: true, data: getAyudaSoporte() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/ayuda-soporte', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const actor = resolveActor(req);
    const saved = saveAyudaSoporte(req.body ?? {}, actor?.username);
    auditActorEvent(req, {
      action: 'ayuda.update',
      module: 'ayuda',
      summary: 'Actualizó contenido de Ayuda y Soporte',
    });
    res.json({ ok: true, data: saved });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/**
 * Snapshot para app externa: equipos con alertas, rangos, config,
 * últimas N alertas, último ciclo de análisis y muestras de decisión.
 *
 * GET /reefer/api/correo/external/monitor
 * Query:
 *   ultimasAlertas=5
 *   includeHistorial=1  → consulta historial oficial por equipo (más lento)
 *   historialHoras=12
 * Auth (si CORREO_EXTERNAL_API_KEY): header x-api-key
 */
app.get('/reefer/api/correo/external/monitor', async (req, res) => {
  if (!requireExternalApiKey(req, res)) return;
  try {
    const data = await buildExternalAlertMonitor({
      ultimasAlertas: Number(req.query.ultimasAlertas ?? 5),
      includeHistorialMuestras:
        req.query.includeHistorial === '1' ||
        req.query.includeHistorial === 'true',
      historialHoras: Number(req.query.historialHoras ?? 12),
      pollMs: POLL_MS,
    });
    res.json({
      ok: true,
      code: 200,
      message: 'Monitor de alertas por correo recuperado correctamente.',
      data,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      code: 500,
      error: e instanceof Error ? e.message : String(e),
      message: 'No se pudo construir el monitor de alertas.',
    });
  }
});

app.get('/reefer/api/correo/config/smtp', (req, res) => {
  if (!requireSuperUser(req, res)) return;
  res.json({ ok: true, data: smtpPublicView(getSmtpConfig()) });
});

app.put('/reefer/api/correo/config/smtp', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const saved = saveSmtpConfig(req.body ?? {});
    auditActorEvent(req, {
      action: 'correo.smtp_update',
      module: 'correo',
      summary: `Actualizó configuración SMTP (${saved.user ?? 'sin usuario'})`,
      detail: { user: saved.user, fromName: saved.fromName },
    });
    res.json({ ok: true, data: smtpPublicView(saved) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/grupos', (req, res) => {
  const actor = resolveActor(req);
  if (!actor || !canManageUsers(actor)) {
    // Ciclo interno / status puede leer todos sin actor; UI manda X-ZTrack-User
    if (!actor) {
      return res.json({ ok: true, data: getGrupos() });
    }
    return res.status(403).json({ ok: false, error: 'Se requiere admin o superadmin' });
  }
  res.json({ ok: true, data: filterGruposForActor(actor, getGrupos()) });
});

app.get('/reefer/api/correo/users', (req, res) => {
  try {
    ensureUserRegistry();
    const actor = requireUserManager(req, res);
    if (!actor) return;
    res.json({ ok: true, data: listUsersForActor(actor) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/users/login', async (req, res) => {
  try {
    const username = req.body?.username?.toString().trim();
    const password = req.body?.password?.toString() ?? '';
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña obligatorios' });
    }
    const user = authenticate(username, password);
    if (user == null) {
      try {
        appendAuditEvent({
          actorUsername: username,
          action: 'login.failed',
          module: 'auth',
          summary: `Intento de login fallido: ${username}`,
        });
      } catch {
        // ignore
      }
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    try {
      appendAuditEvent({
        actorUsername: user.username,
        actorId: user.id,
        action: 'login',
        module: 'auth',
        summary: `Inicio de sesión de ${user.username}`,
      });
    } catch {
      // ignore
    }
    try {
      const { ensureDashboardSchema } = await import('./lib/db.js');
      const { recordUserLogin } = await import('./lib/dashboard/userActivity.js');
      await ensureDashboardSchema();
      await recordUserLogin(user);
    } catch (e) {
      console.warn('[dashboard] login trace:', e.message);
    }
    res.json({ ok: true, data: user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/users/by-username/:username', (req, res) => {
  try {
    ensureUserRegistry();
    const username = req.params.username?.toString().trim();
    const user = getUserByUsername(username);
    if (user == null) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    res.json({ ok: true, data: publicUserView(user) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/users', (req, res) => {
  try {
    const actor = requireUserManager(req, res);
    if (!actor) return;
    const created = addUser(req.body ?? {}, { actor });
    try {
      appendAuditEvent({
        actorUsername: actor.username,
        actorId: actor.id,
        action: 'user.create',
        module: 'usuarios',
        summary: `Creó usuario ${created.username}`,
        targetUsername: created.username,
        targetId: created.id,
        detail: auditSafeDetail({
          role: created.role,
          category: created.category,
          deviceAccess: created.deviceAccess,
        }),
      });
    } catch {
      // ignore
    }
    res.json({ ok: true, data: created });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/users/:id', (req, res) => {
  try {
    ensureUserRegistry();
    const user = getUserByIdPublic(req.params.id);
    if (user == null) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    res.json({ ok: true, data: user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/users/:id', (req, res) => {
  try {
    const actor = requireUserManager(req, res);
    if (!actor) return;
    const updated = updateUser(req.params.id, req.body ?? {}, { actor });
    try {
      appendAuditEvent({
        actorUsername: actor.username,
        actorId: actor.id,
        action: 'user.update',
        module: 'usuarios',
        summary: `Modificó usuario ${updated.username}`,
        targetUsername: updated.username,
        targetId: updated.id,
        detail: auditSafeDetail(req.body),
      });
    } catch {
      // ignore
    }
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/users/:id/profile', (req, res) => {
  try {
    const acting = getUser(req);
    if (!acting || acting === 'sistema') {
      return res.status(401).json({ ok: false, error: 'Usuario no autenticado' });
    }
    const updated = updateOwnProfile(req.params.id, req.body ?? {}, acting);
    try {
      appendAuditEvent({
        actorUsername: acting,
        actorId: updated.id,
        action: 'user.profile_update',
        module: 'perfil',
        summary: 'Actualizó su perfil',
        targetUsername: updated.username,
        targetId: updated.id,
        detail: auditSafeDetail({
          ...req.body,
          passwordChanged: Boolean(req.body?.newPassword),
        }),
      });
    } catch {
      // ignore
    }
    res.json({ ok: true, data: updated });
  } catch (e) {
    const msg = e.message ?? 'Error';
    const status =
      msg.includes('incorrecta') || msg.includes('propio perfil') ? 403 : 400;
    res.status(status).json({ ok: false, error: msg });
  }
});

app.delete('/reefer/api/correo/users/:id', (req, res) => {
  try {
    const actor = requireUserManager(req, res);
    if (!actor) return;
    const before = getUserByIdPublic(req.params.id);
    deleteUser(req.params.id, { actor });
    try {
      appendAuditEvent({
        actorUsername: actor.username,
        actorId: actor.id,
        action: 'user.delete',
        module: 'usuarios',
        summary: `Eliminó usuario ${before?.username ?? req.params.id}`,
        targetUsername: before?.username,
        targetId: req.params.id,
      });
    } catch {
      // ignore
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/audit', (req, res) => {
  try {
    if (!requireAuditAccess(req, res)) return;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = listAuditEvents({
      limit,
      offset,
      actorUsername: req.query.actor?.toString(),
      action: req.query.action?.toString(),
      module: req.query.module?.toString(),
      from: req.query.from?.toString(),
      to: req.query.to?.toString(),
      q: req.query.q?.toString(),
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/audit/catalog', (req, res) => {
  try {
    if (!requireAuditAccess(req, res)) return;
    res.json({ ok: true, data: listAuditActionCatalog() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/audit', (req, res) => {
  try {
    const actor = resolveActor(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'Usuario no autenticado' });
    }
    const body = req.body ?? {};
    const row = appendAuditEvent({
      actorUsername: actor.username,
      actorId: actor.id,
      action: body.action ?? 'event',
      module: body.module ?? 'app',
      summary: body.summary ?? '',
      targetUsername: body.targetUsername,
      targetId: body.targetId,
      detail: auditSafeDetail(body.detail),
    });
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/users/migrate', (req, res) => {
  try {
    const result = migrateUsersFromClient(req.body?.users);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/empresas', (_req, res) => {
  try {
    res.json({ ok: true, data: listEmpresas() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/empresas/:id', (req, res) => {
  try {
    const emp = getEmpresaById(req.params.id);
    if (!emp) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    const usuarios = listUsersByEmpresa(emp.id);
    res.json({ ok: true, data: { ...emp, usuarios } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/empresas', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const created = addEmpresa(req.body ?? {});
    auditActorEvent(req, {
      action: 'empresa.create',
      module: 'empresas',
      summary: `Creó empresa ${created.nombre ?? created.id}`,
      targetId: created.id,
      detail: { nombre: created.nombre, ruc: created.ruc },
    });
    res.json({ ok: true, data: created });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/empresas/:id', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const updated = updateEmpresa(req.params.id, req.body ?? {});
    auditActorEvent(req, {
      action: 'empresa.update',
      module: 'empresas',
      summary: `Modificó empresa ${updated.nombre ?? updated.id}`,
      targetId: updated.id,
      detail: auditSafeDetail(req.body),
    });
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/reefer/api/correo/empresas/:id', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const before = getEmpresaById(req.params.id);
    deleteEmpresa(req.params.id);
    auditActorEvent(req, {
      action: 'empresa.delete',
      module: 'empresas',
      summary: `Eliminó empresa ${before?.nombre ?? req.params.id}`,
      targetId: req.params.id,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/empresas/:id/assign', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const userId = req.body?.userId?.toString().trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId obligatorio' });
    }
    const updated = assignUserEmpresa(userId, req.params.id);
    auditActorEvent(req, {
      action: 'empresa.assign',
      module: 'empresas',
      summary: `Asignó empresa ${req.params.id} a usuario ${updated.username ?? userId}`,
      targetUsername: updated.username,
      targetId: userId,
      detail: { empresaId: req.params.id },
    });
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/empresas/unassign', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const userId = req.body?.userId?.toString().trim();
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId obligatorio' });
    }
    const updated = assignUserEmpresa(userId, null);
    auditActorEvent(req, {
      action: 'empresa.unassign',
      module: 'empresas',
      summary: `Desasignó empresa de usuario ${updated.username ?? userId}`,
      targetUsername: updated.username,
      targetId: userId,
    });
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Grupos de equipos reefer (ACL / asignaciones). Admin + superadmin. */
app.get('/reefer/api/correo/grupos-equipos', (req, res) => {
  try {
    const actor = requireUserManager(req, res);
    if (!actor) return;
    res.json({ ok: true, data: listGruposEquipos() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Lectura para expandir ACL en sesión. */
app.get('/reefer/api/correo/grupos-equipos/public', (req, res) => {
  try {
    const actor = resolveActor(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const all = listGruposEquipos();
    if (canManageUsers(actor)) {
      return res.json({ ok: true, data: all });
    }
    const ids = new Set(
      Array.isArray(actor.groupIds) ? actor.groupIds.map(String) : []
    );
    res.json({ ok: true, data: all.filter((g) => ids.has(g.id)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/grupos-equipos/:id', (req, res) => {
  try {
    const actor = requireUserManager(req, res);
    if (!actor) return;
    const g = getGrupoEquipoById(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    res.json({ ok: true, data: g });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/grupos-equipos', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const actor = resolveActor(req);
    const created = addGrupoEquipo(req.body ?? {}, actor?.username ?? getUser(req));
    auditActorEvent(req, {
      action: 'grupo_equipo.create',
      module: 'administracion',
      summary: `Creó grupo de equipos ${created.nombre}`,
      targetId: created.id,
      detail: {
        nombre: created.nombre,
        empresaId: created.empresaId,
        imeis: created.imeis?.length ?? 0,
      },
    });
    res.json({ ok: true, data: created });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/grupos-equipos/:id', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const updated = updateGrupoEquipo(req.params.id, req.body ?? {});
    auditActorEvent(req, {
      action: 'grupo_equipo.update',
      module: 'administracion',
      summary: `Actualizó grupo de equipos ${updated.nombre}`,
      targetId: updated.id,
      detail: {
        nombre: updated.nombre,
        empresaId: updated.empresaId,
        imeis: updated.imeis?.length ?? 0,
      },
    });
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/reefer/api/correo/grupos-equipos/:id', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const id = req.params.id;
    const prev = getGrupoEquipoById(id);
    if (!prev) {
      return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    }
    const actor = resolveActor(req);
    const users = getUsersPublic();
    for (const u of users) {
      const gids = Array.isArray(u.groupIds) ? u.groupIds : [];
      if (!gids.includes(id)) continue;
      try {
        updateUser(
          u.id,
          { groupIds: gids.filter((x) => x !== id) },
          { actor: actor ?? undefined }
        );
      } catch (err) {
        console.warn('[grupos-equipos] detach user', u.username, err.message);
      }
    }
    deleteGrupoEquipo(id);
    auditActorEvent(req, {
      action: 'grupo_equipo.delete',
      module: 'administracion',
      summary: `Eliminó grupo de equipos ${prev.nombre}`,
      targetId: id,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/device-names/sync', (req, res) => {
  const { names } = req.body ?? {};
  if (names == null || typeof names !== 'object' || Array.isArray(names)) {
    return res.status(400).json({ ok: false, error: 'names debe ser un objeto imei → nombre' });
  }
  const merged = mergeDeviceNames(names);
  res.json({ ok: true, count: Object.keys(merged).length });
});

app.get('/reefer/api/correo/device-names', (_req, res) => {
  res.json({ ok: true, data: getDeviceNamesView() });
});

app.get('/reefer/api/correo/device-names/history', (req, res) => {
  const rowKey = req.query.rowKey?.toString().trim();
  if (!rowKey) {
    return res.status(400).json({ ok: false, error: 'rowKey es obligatorio' });
  }
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json({ ok: true, data: getDeviceNameHistory(rowKey, limit) });
});

app.post('/reefer/api/correo/device-names', (req, res) => {
  try {
    const { rowKey, imei, codigo, name } = req.body ?? {};
    if (!rowKey || !imei) {
      return res.status(400).json({ ok: false, error: 'rowKey e imei son obligatorios' });
    }
    const result = setDeviceName({
      rowKey: String(rowKey).trim(),
      imei: String(imei).trim(),
      codigo: codigo != null ? String(codigo).trim() : undefined,
      name: name != null ? String(name) : '',
      usuario: getUser(req),
    });
    auditActorEvent(req, {
      action: 'device.name_update',
      module: 'listado',
      summary: `Asignó nombre "${name ?? ''}" a ${imei}`,
      targetId: String(imei),
      detail: { rowKey, imei, codigo, name },
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/grupos', (req, res) => {
  if (!requireSuperUser(req, res)) return;
  const grupos = req.body?.grupos;
  if (!Array.isArray(grupos)) {
    return res.status(400).json({ ok: false, error: 'grupos debe ser un array' });
  }
  writeJson('grupos.json', grupos);
  auditActorEvent(req, {
    action: 'correo.grupo_change',
    module: 'correo',
    summary: `Reemplazó lista de grupos (${grupos.length})`,
    detail: { count: grupos.length },
  });
  res.json({ ok: true, count: grupos.length });
});

app.post('/reefer/api/correo/grupos', (req, res) => {
  const actor = requireUserManager(req, res);
  if (!actor) return;
  const all = getGrupos();
  const checked = validateAndNormalizeGrupoSave(actor, req.body, all);
  if (!checked.ok) {
    return res.status(400).json({ ok: false, error: checked.error });
  }
  const grupo = checked.grupo;
  const idx = all.findIndex((g) => g.id === grupo.id);
  const now = new Date().toISOString();
  const entry = {
    ...grupo,
    createdAt: grupo.createdAt ?? (idx >= 0 ? all[idx].createdAt : now),
    updatedAt: now,
  };
  if (idx === -1) all.push(entry);
  else all[idx] = entry;
  writeJson('grupos.json', all);
  auditActorEvent(req, {
    action: 'correo.grupo_change',
    module: 'correo',
    summary: `${idx === -1 ? 'Creó' : 'Actualizó'} grupo ${entry.nombre}`,
    targetId: entry.id,
    detail: {
      id: entry.id,
      nombre: entry.nombre,
      emails: entry.emails,
      ownerUsername: entry.ownerUsername,
    },
  });
  res.json({ ok: true, data: entry });
});

app.delete('/reefer/api/correo/grupos/:id', (req, res) => {
  const actor = requireUserManager(req, res);
  if (!actor) return;
  const before = getGrupos().find((g) => g.id === req.params.id);
  if (!before) {
    return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
  }
  if (!isSuperAdminUser(actor) && !grupoOwnedBy(before, actor.username)) {
    return res.status(403).json({ ok: false, error: 'No puede eliminar un grupo de otro usuario' });
  }
  const all = getGrupos().filter((g) => g.id !== req.params.id);
  writeJson('grupos.json', all);
  auditActorEvent(req, {
    action: 'correo.grupo_change',
    module: 'correo',
    summary: `Eliminó grupo ${before?.nombre ?? req.params.id}`,
    targetId: req.params.id,
  });
  res.json({ ok: true });
});

app.get('/reefer/api/correo/envios', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  res.json({ ok: true, data: getEnvios().slice(0, limit) });
});

app.get('/reefer/api/correo/incidentes', (req, res) => {
  const { imei, rowKey, estado, dia, incluirArchivados } = req.query;
  const imeis = typeof imei === 'string' && imei ? imei.split(',') : null;
  const rowKeys = typeof rowKey === 'string' && rowKey ? rowKey.split(',') : null;
  let list = getIncidentes();
  if (incluirArchivados !== 'true') {
    list = list.filter((i) => i.archivado !== true);
  }
  if (rowKeys) list = list.filter((i) => rowKeys.includes(i.rowKey));
  else if (imeis) list = list.filter((i) => imeis.includes(i.imei));
  if (estado === 'pendiente' || estado === 'atendida' || estado === 'cerrado') {
    list = list.filter((i) => i.estado === estado);
  }
  if (typeof dia === 'string' && dia) {
    list = list.filter((i) => i.diaCalendario === dia);
  }
  const hoy = todayKey();
  const ayer = yesterdayKey();
  res.json({
    ok: true,
    data: list,
    meta: { hoy, ayer, total: list.length },
  });
});

app.post('/reefer/api/correo/incidentes/archivar-todos', (req, res) => {
  if (req.headers['x-ztrack-super-user'] !== 'true') {
    return res.status(403).json({ ok: false, error: 'Solo superusuario puede archivar incidentes' });
  }
  try {
    const result = archiveAllIncidentes(getUser(req));
    auditActorEvent(req, {
      action: 'incidente.archive_all',
      module: 'correo',
      summary: `Archivó todos los incidentes (${result.count ?? 0})`,
      detail: result,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/reefer/api/correo/incidentes/:id', (req, res) => {
  if (req.headers['x-ztrack-super-user'] !== 'true') {
    return res.status(403).json({ ok: false, error: 'Solo superusuario puede archivar incidentes' });
  }
  try {
    const archived = archiveIncidente(req.params.id, getUser(req));
    auditActorEvent(req, {
      action: 'incidente.archive',
      module: 'correo',
      summary: `Archivó incidente ${req.params.id}`,
      targetId: req.params.id,
      detail: { imei: archived?.imei, rowKey: archived?.rowKey },
    });
    res.json({ ok: true, data: archived });
  } catch (e) {
    res.status(e.message === 'Incidente no encontrado' ? 404 : 500).json({
      ok: false,
      error: e.message,
    });
  }
});

app.patch('/reefer/api/correo/incidentes/:id', (req, res) => {
  const { action, texto } = req.body ?? {};
  const usuario = getUser(req);
  const all = getIncidentes();
  const idx = all.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Incidente no encontrado' });

  const inc = { ...all[idx] };
  if (action === 'comentar') {
    if (!texto?.trim()) {
      return res.status(400).json({ ok: false, error: 'Comentario vacío' });
    }
    inc.comentarios = [
      ...(inc.comentarios ?? []),
      { id: uid('cmt'), autor: usuario, texto: texto.trim(), createdAt: new Date().toISOString() },
    ];
  } else if (action === 'atender') {
    inc.estado = 'atendida';
    inc.atendidaAt = new Date().toISOString();
    inc.atendidaPor = usuario;
    if (texto?.trim()) {
      inc.comentarios = [
        ...(inc.comentarios ?? []),
        {
          id: uid('cmt'),
          autor: usuario,
          texto: texto.trim(),
          createdAt: new Date().toISOString(),
        },
      ];
    }
  } else {
    return res.status(400).json({ ok: false, error: 'action debe ser comentar o atender' });
  }

  all[idx] = inc;
  writeJson('incidentes.json', all);
  auditActorEvent(req, {
    action: action === 'atender' ? 'incidente.atender' : 'incidente.comentar',
    module: 'correo',
    summary: `${action === 'atender' ? 'Atendió' : 'Comentó'} incidente ${inc.id}`,
    targetId: inc.id,
    detail: { imei: inc.imei, action },
  });
  res.json({ ok: true, data: inc });
});

app.get('/reefer/api/correo/ciclos', (req, res) => {
  if (!requireSuperUser(req, res)) return;
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  res.json({ ok: true, data: listCiclos(limit) });
});

app.get('/reefer/api/correo/ciclos/:id', (req, res) => {
  if (!requireSuperUser(req, res)) return;
  const ciclo = getCicloById(req.params.id);
  if (!ciclo) return res.status(404).json({ ok: false, error: 'Ciclo no encontrado' });
  res.json({ ok: true, data: ciclo });
});

app.get('/reefer/api/correo/alert-config', (_req, res) => {
  res.json({ ok: true, data: getDeviceAlertConfigMap() });
});

app.get('/reefer/api/correo/alert-config/state', (_req, res) => {
  res.json({ ok: true, data: getAlertStateView() });
});

app.get('/reefer/api/correo/alert-config/:rowKey/eventos', async (req, res) => {
  try {
    const rowKey = decodeURIComponent(req.params.rowKey);
    const data = await getDeviceEventosView(rowKey);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/alert-config/:rowKey', (req, res) => {
  const actor = requireUserManager(req, res);
  if (!actor) return;
  const rowKey = decodeURIComponent(req.params.rowKey);
  const {
    mode,
    umbralesHoras,
    useReferenciaManual,
    referenciaManual,
    alerta1Hora,
    alerta30Minutos,
    useRangoPersonalizado,
    margenInferior,
    margenSuperior,
  } = req.body ?? {};
  try {
    // Admin: solo equipos de sus grupos o de su deviceAccess
    if (!isSuperAdminUser(actor)) {
      const inOwned = getGrupos().some(
        (g) =>
          grupoOwnedBy(g, actor.username) &&
          (g.devices ?? []).some((d) => d.rowKey === rowKey)
      );
      const imei = (getGrupos().flatMap((g) => g.devices ?? []).find((d) => d.rowKey === rowKey)
        ?.imei) ?? rowKey.split('-').slice(-1)[0];
      if (!inOwned && !actorMayAccessImei(actor, imei)) {
        return res.status(403).json({
          ok: false,
          error: 'Solo puede configurar alertas de equipos asignados',
        });
      }
    }
    const entry = saveDeviceAlertConfig(rowKey, {
      mode: mode === 'custom' ? 'custom' : 'standard',
      umbralesHoras,
      useReferenciaManual: Boolean(useReferenciaManual),
      referenciaManual: referenciaManual ?? undefined,
      alerta1Hora: Boolean(alerta1Hora),
      alerta30Minutos: Boolean(alerta30Minutos),
      useRangoPersonalizado: Boolean(useRangoPersonalizado),
      margenInferior: margenInferior != null ? Number(margenInferior) : undefined,
      margenSuperior: margenSuperior != null ? Number(margenSuperior) : undefined,
    });
    auditActorEvent(req, {
      action: 'alarma.config_update',
      module: 'alarma',
      summary: `Actualizó alarmas de ${rowKey}`,
      targetId: rowKey,
      detail: {
        mode: entry.mode,
        alerta1Hora: entry.alerta1Hora,
        alerta30Minutos: entry.alerta30Minutos,
      },
    });
    res.json({ ok: true, data: entry });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/alert-config/:rowKey/referencia', async (req, res) => {
  const rowKey = decodeURIComponent(req.params.rowKey);
  const { action, since, resetSentUmbrales } = req.body ?? {};
  try {
    if (action === 'manual') {
      if (!since) return res.status(400).json({ ok: false, error: 'since obligatorio para referencia manual' });
      const data = applyManualDeviceReference(rowKey, since, Boolean(resetSentUmbrales));
      auditActorEvent(req, {
        action: 'alarma.config_update',
        module: 'alarma',
        summary: `Referencia manual en ${rowKey}`,
        targetId: rowKey,
        detail: { action: 'manual', since },
      });
      return res.json({ ok: true, data });
    }
    if (action === 'historial') {
      const data = await refreshDeviceReferenceFromHistorial(rowKey);
      auditActorEvent(req, {
        action: 'alarma.config_update',
        module: 'alarma',
        summary: `Refrescó referencia historial de ${rowKey}`,
        targetId: rowKey,
        detail: { action: 'historial' },
      });
      return res.json({ ok: true, data });
    }
    res.status(400).json({ ok: false, error: 'action debe ser historial o manual' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/historial/limpiar', (req, res) => {
  const {
    envios: limpiarEnvios = true,
    ciclos: limpiarCiclos = true,
    incidentes: limpiarIncidentes = true,
    episodios: limpiarEpisodios = false,
  } = req.body ?? {};
  const cleared = [];
  try {
    if (limpiarEnvios) {
      writeJson('envios.json', []);
      cleared.push('envios');
    }
    if (limpiarCiclos) {
      writeJson('ciclos.json', []);
      cleared.push('ciclos');
    }
    if (limpiarIncidentes) {
      const { count } = archiveAllIncidentes(getUser(req));
      cleared.push(`incidentes (${count} archivados)`);
    }
    if (limpiarEpisodios) {
      writeJson('state.json', { episodes: {}, lastRecovered: {} });
      cleared.push('episodios');
    }
    auditActorEvent(req, {
      action: 'correo.historial_limpiar',
      module: 'correo',
      summary: `Limpió historial correo: ${cleared.join(', ')}`,
      detail: { cleared },
    });
    res.json({ ok: true, cleared });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/run', async (_req, res) => {
  try {
    const result = await runAlertCycle({ trigger: 'manual' });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/migrate', (req, res) => {
  const { smtp, grupos } = req.body ?? {};
  try {
    if (smtp?.user && smtp?.appPassword) {
      const current = getSmtpConfig();
      if (!current?.appPassword) {
        saveSmtpConfig(smtp);
      }
    }
    if (Array.isArray(grupos) && grupos.length) {
      const existing = getGrupos();
      if (existing.length === 0) writeJson('grupos.json', grupos);
    }
    res.json({ ok: true, data: smtpPublicView(getSmtpConfig()) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/send', async (req, res) => {
  const { smtp, to, subject, text, html } = req.body ?? {};
  const cfg = smtp ?? getSmtpConfig();
  if (!cfg?.user || !cfg?.appPassword) {
    return res.status(400).json({ ok: false, error: 'SMTP no configurado' });
  }
  const recipients = Array.isArray(to)
    ? to.map((e) => String(e).trim()).filter(isValidEmail)
    : [];
  if (!recipients.length || !subject?.trim()) {
    return res.status(400).json({ ok: false, error: 'Destinatarios y asunto obligatorios' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: cfg.user, pass: cfg.appPassword.replace(/\s/g, '') },
    });
    const info = await transporter.sendMail({
      from: `"${cfg.fromName || 'ZTRACK TELEMETRY'}" <${cfg.user}>`,
      to: recipients.join(', '),
      subject: subject.trim(),
      text,
      html,
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  ensureUserRegistry();
  console.log(`ZTRACK correo API :${PORT} · ciclo cada ${POLL_MS / 1000}s`);
  // Una sola cadena de migración (analisis → dashboard). Evita CREATE TABLE
  // concurrente que dispara pg_type_typname_nsp_index.
  ensureAnalisisSchema()
    .then(() => {
      setTimeout(() => {
        captureDashboardSnapshotSafe()
          .then((r) => console.log('[dashboard] snapshot inicial', r?.id ?? r?.skipped ?? 'ok'))
          .catch((e) => console.warn('[dashboard] snapshot inicial:', e.message));
      }, 8000);
      setInterval(() => {
        captureDashboardSnapshotSafe().catch((e) =>
          console.warn('[dashboard] snapshot:', e.message)
        );
      }, DASHBOARD_SNAPSHOT_MS);
      console.log(
        `[dashboard] snapshots cada ${DASHBOARD_SNAPSHOT_MS / 1000}s`
      );
    })
    .catch((e) => console.warn('[analisis/dashboard] esquema diferido:', e.message));
  setTimeout(() => {
    runAlertCycle({ trigger: 'automatic' }).catch((e) =>
      console.error('[correo] ciclo inicial', e.message)
    );
  }, 5000);
  setInterval(() => {
    runAlertCycle({ trigger: 'automatic' }).catch((e) =>
      console.error('[correo] ciclo', e.message)
    );
  }, POLL_MS);
});
