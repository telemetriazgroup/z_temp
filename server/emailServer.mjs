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
} from './lib/usersRepository.js';
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

app.use(express.json({ limit: '512kb' }));
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

function isSuperUserRequest(req) {
  return req.headers['x-ztrack-super-user']?.toString().toLowerCase() === 'true';
}

function requireSuperUser(req, res) {
  if (!isSuperUserRequest(req)) {
    res.status(403).json({ ok: false, error: 'Se requiere superusuario' });
    return false;
  }
  return true;
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

app.get('/reefer/api/correo/config/smtp', (_req, res) => {
  res.json({ ok: true, data: smtpPublicView(getSmtpConfig()) });
});

app.put('/reefer/api/correo/config/smtp', (req, res) => {
  try {
    const saved = saveSmtpConfig(req.body ?? {});
    res.json({ ok: true, data: smtpPublicView(saved) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/reefer/api/correo/grupos', (_req, res) => {
  res.json({ ok: true, data: getGrupos() });
});

app.get('/reefer/api/correo/users', (req, res) => {
  try {
    ensureUserRegistry();
    if (!requireSuperUser(req, res)) return;
    res.json({ ok: true, data: getUsersPublic() });
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
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
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
    const { password: _p, ...publicUser } = user;
    res.json({ ok: true, data: publicUser });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reefer/api/correo/users', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    const created = addUser(req.body ?? {});
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
    if (!requireSuperUser(req, res)) return;
    const updated = updateUser(req.params.id, req.body ?? {});
    res.json({ ok: true, data: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/reefer/api/correo/users/:id', (req, res) => {
  try {
    if (!requireSuperUser(req, res)) return;
    deleteUser(req.params.id);
    res.json({ ok: true });
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
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.put('/reefer/api/correo/grupos', (req, res) => {
  const grupos = req.body?.grupos;
  if (!Array.isArray(grupos)) {
    return res.status(400).json({ ok: false, error: 'grupos debe ser un array' });
  }
  writeJson('grupos.json', grupos);
  res.json({ ok: true, count: grupos.length });
});

app.post('/reefer/api/correo/grupos', (req, res) => {
  const grupo = req.body;
  if (!grupo?.id || !grupo?.nombre) {
    return res.status(400).json({ ok: false, error: 'Grupo inválido' });
  }
  const all = getGrupos();
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
  res.json({ ok: true, data: entry });
});

app.delete('/reefer/api/correo/grupos/:id', (req, res) => {
  const all = getGrupos().filter((g) => g.id !== req.params.id);
  writeJson('grupos.json', all);
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
  res.json({ ok: true, data: inc });
});

app.get('/reefer/api/correo/ciclos', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  res.json({ ok: true, data: listCiclos(limit) });
});

app.get('/reefer/api/correo/ciclos/:id', (req, res) => {
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
      return res.json({ ok: true, data });
    }
    if (action === 'historial') {
      const data = await refreshDeviceReferenceFromHistorial(rowKey);
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
