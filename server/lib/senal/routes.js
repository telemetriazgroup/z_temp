import { Router } from 'express';
import { ensureSenalSchema, ensureDashboardSchema } from '../db.js';
import { getUserByUsername, isSuperAdminUser } from '../usersRepository.js';
import { analyzeSenalBehavior } from './behavior.js';
import {
  listSenalUbicaciones,
  getSenalUbicacion,
  upsertSenalUbicacion,
} from './ubicacionRepository.js';
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

  router.get('/behavior', async (req, res) => {
    try {
      if (!requireSuper(req, res)) return;
      await ensureDashboardSchema();
      await ensureSenalSchema();
      const now = new Date();
      const anio = Number(req.query.anio ?? now.getFullYear());
      const mes = Number(req.query.mes ?? now.getMonth() + 1);
      const imei = req.query.imei ? String(req.query.imei).trim() : null;
      const data = await analyzeSenalBehavior({ anio, mes, imei });
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
