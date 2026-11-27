import express from 'express';
import fs from 'fs';
import path from 'path';
import { ensureUserRegistry, getUserByUsername } from '../usersRepository.js';
import { loadCurrentDispositivos } from '../dashboard/fleetStore.js';
import { filterDispositivosForUser } from '../dashboard/snapshot.js';
import { getDeviceNameByRowKey, tieneNombreEnOtraFamilia } from '../deviceNamesRepository.js';
import { getInformeJob, informeFilePath, startInformeJob } from './generador.js';

function actorFrom(req) {
  const username = req.headers['x-ztrack-user']?.toString().trim();
  if (!username) return null;
  ensureUserRegistry();
  return getUserByUsername(username) ?? null;
}

function nombreTelemetria(actor, device) {
  const perfil = actor?.deviceNames?.[device.imei];
  if (typeof perfil === 'string' && perfil.trim() && perfil.trim() !== 'SIN ASIGNAR') {
    return perfil.trim();
  }
  const rowKey = device.codigo ? `${String(device.codigo).toUpperCase()}-${device.imei}` : device.imei;
  return getDeviceNameByRowKey(rowKey) || getDeviceNameByImei(device.imei) || null;
}

function dispositivoVisible(actor, codigo, imei) {
  return loadCurrentDispositivos().then((all) => {
    const visibles = filterDispositivosForUser(all, actor);
    return (
      visibles.find(
        (d) =>
          String(d.imei) === String(imei) &&
          String(d.codigo ?? '').toUpperCase() === String(codigo).toUpperCase()
      ) ?? null
    );
  });
}

export function createInformeRouter() {
  const router = express.Router();

  router.get('/equipos', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(401).json({ ok: false, error: 'Sesión requerida' });
      const all = await loadCurrentDispositivos();
      const visibles = filterDispositivosForUser(all, actor);
      const data = visibles
        .map((d) => ({
          imei: d.imei,
          codigo: d.codigo ?? null,
          nombre: nombreTelemetria(actor, d),
        }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/generar', async (req, res) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return res.status(401).json({ ok: false, error: 'Sesión requerida' });
      const body = req.body ?? {};
      const imei = String(body.imei ?? '').trim();
      const codigo = String(body.codigo ?? '').trim().toUpperCase();
      const desde = String(body.desde ?? '').trim();
      const hasta = String(body.hasta ?? '').trim();
      if (!imei || !codigo) {
        return res.status(400).json({ ok: false, error: 'Seleccione un equipo' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return res.status(400).json({ ok: false, error: 'Indique desde y hasta (AAAA-MM-DD)' });
      }
      const device = await dispositivoVisible(actor, codigo, imei);
      if (!device) {
        return res.status(403).json({ ok: false, error: 'Ese equipo no está en su flota' });
      }
      const ligado = nombreTelemetria(actor, device);
      const nombre = ligado || String(body.nombre ?? '').trim();
      if (!nombre) {
        return res.status(400).json({
          ok: false,
          error: 'Este equipo no tiene nombre en telemetría. Indique el nombre del informe.',
        });
      }
      const idioma = ['es', 'en', 'ambos'].includes(body.idioma) ? body.idioma : 'es';
      const job = startInformeJob({
        owner: actor.username,
        imei,
        codigo,
        desde,
        hasta,
        nombre,
        idioma,
        tolerancia: body.tolerancia,
        huecoMinMin: body.huecoMinMin,
        reconstruir: body.reconstruir !== false && body.reconstruir !== 'false',
        huecoMaxHoras: body.huecoMaxHoras,
        defrostInicio: body.defrostInicio,
        defrostFin: body.defrostFin,
        defrostMaxMin: body.defrostMaxMin,
        empresa: body.empresa,
        pieIzquierdo: body.pieIzquierdo,
        pieCentro: body.pieCentro,
      });
      res.json({ ok: true, data: { id: job.id, status: job.status } });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/job/:id', (req, res) => {
    const actor = actorFrom(req);
    if (!actor) return res.status(401).json({ ok: false, error: 'Sesión requerida' });
    const job = getInformeJob(req.params.id);
    if (!job || job.owner !== actor.username) {
      return res.status(404).json({ ok: false, error: 'Informe no encontrado' });
    }
    res.json({
      ok: true,
      data: {
        id: job.id,
        status: job.status,
        log: job.log,
        error: job.error,
        result: job.result,
      },
    });
  });

  router.get('/job/:id/archivo/:nombre', (req, res) => {
    const actor = actorFrom(req);
    if (!actor) return res.status(401).json({ ok: false, error: 'Sesión requerida' });
    const job = getInformeJob(req.params.id);
    if (!job || job.owner !== actor.username || job.status !== 'done') {
      return res.status(404).json({ ok: false, error: 'Archivo no disponible' });
    }
    const file = informeFilePath(job.id, path.basename(req.params.nombre));
    if (!file || !fs.existsSync(file)) {
      return res.status(404).json({ ok: false, error: 'Archivo no disponible' });
    }
    res.download(file, path.basename(file));
  });

  return router;
}
