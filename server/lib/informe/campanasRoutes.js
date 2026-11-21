import express from 'express';
import { ensureUserRegistry, getUserByUsername, isSuperAdminUser } from '../usersRepository.js';
import {
  ajustarDiaCorrida,
  borrarCampana,
  getCorrida,
  guardarCampana,
  lanzarCampana,
  listCampanas,
  listCorridas,
} from './campanas.js';

function actorFrom(req) {
  const username = req.headers['x-ztrack-user']?.toString().trim();
  if (!username) return null;
  ensureUserRegistry();
  const actor = getUserByUsername(username);
  if (!actor || !isSuperAdminUser(actor)) return null;
  return actor;
}

export function createCampanasRouter() {
  const router = express.Router();

  router.get('/campanas', (req, res) => {
    const actor = actorFrom(req);
    if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    res.json({ ok: true, data: listCampanas(actor) });
  });

  router.post('/campanas', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      const data = await guardarCampana(actor, req.body ?? {});
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.put('/campanas/:id', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      const data = await guardarCampana(actor, req.body ?? {}, req.params.id);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.delete('/campanas/:id', (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      borrarCampana(actor, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/campanas/:id/lanzar', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      const data = await lanzarCampana(actor, req.params.id);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/campanas/:id/corridas', (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      res.json({ ok: true, data: listCorridas(actor, req.params.id) });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/corridas/:id/ajustar', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      const data = await ajustarDiaCorrida(actor, req.params.id, req.body ?? {});
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/corridas/:id', (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
      res.json({ ok: true, data: getCorrida(actor, req.params.id) });
    } catch (e) {
      res.status(404).json({ ok: false, error: e.message });
    }
  });

  return router;
}
