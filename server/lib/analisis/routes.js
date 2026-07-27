import express from 'express';
import XLSX from 'xlsx';
import {
  runAnalisisMensual,
  getAnalisisCompleto,
  patchEventoClasificacion,
  getEventoSerie,
  interpolarHueco,
} from './engine.js';
import { checkDbHealth, ensureAnalisisSchema } from '../db.js';

export function createAnalisisRouter() {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    try {
      await ensureAnalisisSchema();
      const db = await checkDbHealth();
      res.json({ ok: db.ok, db });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  router.get('/mensual', async (req, res) => {
    try {
      await ensureAnalisisSchema();
      const imei = String(req.query.imei ?? '').trim();
      const codigo = String(req.query.codigo ?? '').trim().toUpperCase();
      const anio = Number(req.query.anio);
      const mes = Number(req.query.mes);
      if (!imei || !codigo || !anio || !mes) {
        return res.status(400).json({ ok: false, error: 'imei, codigo, anio, mes requeridos' });
      }
      const isAdmin = req.headers['x-ztrack-super-user'] === 'true';
      const data = await getAnalisisCompleto(
        { imei, codigo, anio, mes },
        { isAdmin }
      );
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/mensual/run', async (req, res) => {
    try {
      await ensureAnalisisSchema();
      const { imei, codigo, anio, mes, regenerar, rangoAnalisis } = req.body ?? {};
      if (!imei || !codigo || !anio || !mes) {
        return res.status(400).json({ ok: false, error: 'imei, codigo, anio, mes requeridos' });
      }
      if (regenerar && req.headers['x-ztrack-super-user'] !== 'true') {
        return res.status(403).json({ ok: false, error: 'Solo admin puede regenerar el mes' });
      }
      const isAdmin = req.headers['x-ztrack-super-user'] === 'true';
      const data = await runAnalisisMensual({
        imei: String(imei).trim(),
        codigo: String(codigo).trim().toUpperCase(),
        anio: Number(anio),
        mes: Number(mes),
        regenerar: Boolean(regenerar),
        rangoAnalisis: rangoAnalisis ?? null,
        isAdmin,
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/mensual/:id/regenerar', async (req, res) => {
    try {
      if (req.headers['x-ztrack-super-user'] !== 'true') {
        return res.status(403).json({ ok: false, error: 'Solo admin puede regenerar' });
      }
      await ensureAnalisisSchema();
      const { getAnalisisById } = await import('./repository.js');
      const row = await getAnalisisById(req.params.id);
      if (row == null) {
        return res.status(404).json({ ok: false, error: 'Análisis no encontrado' });
      }
      const data = await runAnalisisMensual({
        imei: row.imei,
        codigo: row.codigo,
        anio: row.anio,
        mes: row.mes,
        regenerar: true,
        rangoAnalisis: req.body?.rangoAnalisis ?? row.rango_config_snapshot ?? null,
        isAdmin: true,
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.patch('/eventos/:eventoId', async (req, res) => {
    try {
      const autor = req.headers['x-ztrack-user'] ?? req.body?.autor ?? null;
      const data = await patchEventoClasificacion(req.params.eventoId, {
        clasificacion: req.body?.clasificacion,
        detalle: req.body?.detalle,
        autor,
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/eventos/:eventoId/serie', async (req, res) => {
    try {
      const data = await getEventoSerie(req.params.eventoId);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/huecos/:eventoId/interpolar', async (req, res) => {
    try {
      if (req.headers['x-ztrack-super-user'] !== 'true') {
        return res.status(403).json({ ok: false, error: 'Solo admin puede interpolar' });
      }
      const autor = req.headers['x-ztrack-user'] ?? null;
      const data = await interpolarHueco(req.params.eventoId, { autor });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/mensual/:id/export.csv', async (req, res) => {
    try {
      const isAdmin = req.headers['x-ztrack-super-user'] === 'true';
      const data = await getAnalisisCompleto(req.params.id, { isAdmin });
      if (data == null) {
        return res.status(404).json({ ok: false, error: 'No encontrado' });
      }
      const lines = [
        'tipo,label,since,until,durationHours,clasificacion,detalle',
        ...data.eventos.map((e) =>
          [
            e.tipoUi,
            JSON.stringify(e.label),
            e.since,
            e.until ?? '',
            e.durationHours,
            e.clasificacion,
            JSON.stringify(e.detalle ?? ''),
          ].join(',')
        ),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analisis_${data.analisis.anio}_${data.analisis.mes}.csv"`
      );
      res.send(lines.join('\n'));
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get('/mensual/:id/export.xlsx', async (req, res) => {
    try {
      const isAdmin = req.headers['x-ztrack-super-user'] === 'true';
      const data = await getAnalisisCompleto(req.params.id, { isAdmin });
      if (data == null) {
        return res.status(404).json({ ok: false, error: 'No encontrado' });
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          {
            imei: data.analisis.imei,
            codigo: data.analisis.codigo,
            anio: data.analisis.anio,
            mes: data.analisis.mes,
            analizadoDesde: data.analisis.analizadoDesde,
            analizadoHasta: data.analisis.analizadoHasta,
            ...data.resumen,
          },
        ]),
        'Resumen'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.semanas),
        'Semanas'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.eventos.map((e) => ({
            tipo: e.tipoUi,
            label: e.label,
            since: e.since,
            until: e.until,
            durationHours: e.durationHours,
            clasificacion: e.clasificacion,
            detalle: e.detalle,
          }))
        ),
        'Eventos'
      );
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analisis_${data.analisis.anio}_${data.analisis.mes}.xlsx"`
      );
      res.send(buf);
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  return router;
}
