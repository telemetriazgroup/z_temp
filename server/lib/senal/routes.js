import { Router } from 'express';
import { ensureSenalSchema, ensureDashboardSchema } from '../db.js';
import { getUserByUsername, isSuperAdminUser } from '../usersRepository.js';
import {
  getPersistedMonthReport,
  getDeviceSenalHistory,
  processSenalIncrementalSafe,
} from './engine.js';
import {
  readSenalJob,
  startSenalJob,
  pauseSenalJob,
  resumeSenalJob,
  startSenalJobRunner,
} from './jobRunner.js';
import {
  listSenalUbicaciones,
  getSenalUbicacion,
  upsertSenalUbicacion,
} from './ubicacionRepository.js';
import { insertEvento, deleteEvento } from './repository.js';
import { appendAuditEvent } from '../auditLogRepository.js';

function resolveActor(req) {
  const username = String(req.headers['x-ztrack-user'] ?? '').trim();
  if (!username) return null;
  return getUserByUsername(username);
}

function requireSuper(req, res) {
  const actor = resolveActor(req);
  const headerSuper =
    req.headers['x-ztrack-super-user']?.toString().toLowerCase() === 'true';
  if (!actor || (!isSuperAdminUser(actor) && !headerSuper)) {
    res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    return null;
  }
  return actor;
}

export function createSenalRouter() {
  const router = Router();

  /** Reporte mensual desde datos persistidos (incremental). */
  router.get('/behavior', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureSenalSchema();
      const now = new Date();
      const anio = Number(req.query.anio ?? now.getFullYear());
      const mes = Number(req.query.mes ?? now.getMonth() + 1);
      const imei = req.query.imei ? String(req.query.imei).trim() : null;
      const data = await getPersistedMonthReport(anio, mes, imei);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  /** Forzar drenado del cursor (útil tras despliegue). */
  router.post('/process', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureDashboardSchema();
      await ensureSenalSchema();
      const data = await processSenalIncrementalSafe();
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/job', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureSenalSchema();
      startSenalJobRunner();
      res.json({ ok: true, data: await readSenalJob() });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/job/start', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureDashboardSchema();
      await ensureSenalSchema();
      const fromScratch = Boolean(req.body?.fromScratch);
      const data = await startSenalJob({
        fromScratch,
        actor: actor.username,
      });
      appendAuditEvent({
        actorUsername: actor.username,
        action: fromScratch ? 'senal.job.from_scratch' : 'senal.job.start',
        module: 'analisis-senal',
        summary: fromScratch
          ? 'Puso en marcha análisis de señal desde 0'
          : 'Reanudó análisis incremental de señal',
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/job/pause', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureSenalSchema();
      res.json({ ok: true, data: await pauseSenalJob() });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/job/resume', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureSenalSchema();
      res.json({ ok: true, data: await resumeSenalJob(actor.username) });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  /** Desde 0: resetea y pone el job en marcha (no bloquea). */
  router.post('/reprocess', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureDashboardSchema();
      await ensureSenalSchema();
      const data = await startSenalJob({ fromScratch: true, actor: actor.username });
      appendAuditEvent({
        actorUsername: actor.username,
        action: 'senal.reprocess.from_scratch',
        module: 'analisis-senal',
        summary: 'Reanalizó señal desde 0 (job en segundo plano)',
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/ubicaciones', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureSenalSchema();
      const data = await listSenalUbicaciones();
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get('/ubicaciones/:imei', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureSenalSchema();
      const data = await getSenalUbicacion(req.params.imei);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get('/devices/:imei', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureDashboardSchema();
      await ensureSenalSchema();
      const data = await getDeviceSenalHistory(req.params.imei);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/eventos', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureSenalSchema();
      const data = await insertEvento(req.body ?? {}, actor.username);
      appendAuditEvent({
        actorUsername: actor.username,
        action: 'senal.evento.create',
        module: 'analisis-senal',
        summary: `Registró evento ${data.tipo} en IMEI ${data.imei}`,
        targetId: String(data.id),
        detail: { imei: data.imei, tipo: data.tipo, titulo: data.titulo },
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.delete('/eventos/:id', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureSenalSchema();
      const imei = req.query.imei ? String(req.query.imei) : null;
      const data = await deleteEvento(req.params.id, imei);
      if (!data) {
        res.status(404).json({ ok: false, error: 'Evento no encontrado' });
        return;
      }
      appendAuditEvent({
        actorUsername: actor.username,
        action: 'senal.evento.delete',
        module: 'analisis-senal',
        summary: `Eliminó evento ${data.id}`,
        targetId: String(data.id),
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.put('/ubicaciones/:imei', async (req, res) => {
    try {
      const actor = requireSuper(req, res);
      if (!actor) return;
      await ensureSenalSchema();
      const data = await upsertSenalUbicacion(
        req.params.imei,
        req.body ?? {},
        actor.username
      );
      appendAuditEvent({
        actorUsername: actor.username,
        action: 'senal.ubicacion.upsert',
        module: 'analisis-senal',
        summary: `Actualizó ubicación/señal de IMEI ${data.imei}`,
        targetId: data.imei,
        detail: {
          pais: data.pais,
          departamento: data.departamento,
          distrito: data.distrito,
          zona: data.zona,
        },
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  return router;
}
