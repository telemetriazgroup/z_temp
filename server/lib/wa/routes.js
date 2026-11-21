import express from 'express';
import { ensureWaSchema } from './schema.js';
import {
  aprobarManual,
  contactoPorUsername,
  eliminarContacto,
  exportarDatos,
  guardarContacto,
  iniciarPrueba,
  listarChats,
  listarContactos,
  listarMensajes,
  listarSilencio,
  obtenerContacto,
  obtenerContactoPorTelefono,
  reemplazarAsignaciones,
  revocar,
  setPausaAlertas,
  setSilencio,
} from './repository.js';
import { enviarPrueba } from './conversacion.js';
import { enviarMensajePrueba, estadoWa, reiniciarWaClient, startWaClient } from './client.js';
import { guardarNumeroPropio, sincronizarNumeroUsuario } from './cuenta.js';
import { normalizarTelefono } from './telefono.js';
import { TIEMPOS_WA } from './tiempos.js';
import { colaPendiente } from './outbox.js';

function esSuper(actor) {
  return actor?.superUser === true || actor?.category === 'superadmin';
}

function limiteDia(fecha, fin) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return null;
  const hora = fin ? '23:59:59.999' : '00:00:00.000';
  return new Date(`${fecha}T${hora}-05:00`).toISOString();
}

export function createWaRouter({ actorOf }) {
  const r = express.Router();

  r.use(async (req, res, next) => {
    try {
      await ensureWaSchema();
      next();
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  function actor(req, res) {
    const user = actorOf(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Usuario requerido' });
      return null;
    }
    return user;
  }

  r.get('/mio', async (req, res) => {
    const user = actor(req, res);
    if (!user) return;
    const contacto = await contactoPorUsername(user.username);
    res.json({
      ok: true,
      data: {
        numero: user.whatsappNumero || contacto?.telefono || '',
        contacto,
        silencios: contacto ? await listarSilencio(contacto.id) : [],
        sesionLista: estadoWa().listo === true,
      },
    });
  });

  r.post('/mio', async (req, res) => {
    const user = actor(req, res);
    if (!user) return;
    try {
      const numero = normalizarTelefono(req.body?.numero ?? '');
      const actualizado = guardarNumeroPropio(user, numero);
      const contacto = await sincronizarNumeroUsuario({ ...actualizado, whatsappNumero: numero });
      res.json({ ok: true, data: { numero, contacto } });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.post('/mio/prueba', async (req, res) => {
    const user = actor(req, res);
    if (!user) return;
    const contacto = await contactoPorUsername(user.username);
    if (!contacto) {
      return res.status(400).json({ ok: false, error: 'Registre su número de WhatsApp antes de la prueba' });
    }
    if (!estadoWa().listo) {
      return res.status(409).json({ ok: false, error: 'WhatsApp aún no está conectado. El superadmin debe tener la sesión vinculada.' });
    }
    const actualizado = await iniciarPrueba(contacto.id);
    await enviarPrueba(actualizado);
    res.json({ ok: true, data: actualizado, aviso: 'Responda OK, luego ESTADO y luego AYUDA para activar las alertas.' });
  });

  r.post('/mio/pausa', async (req, res) => {
    const user = actor(req, res);
    if (!user) return;
    const contacto = await contactoPorUsername(user.username);
    if (!contacto) return res.status(400).json({ ok: false, error: 'No hay número registrado' });
    const data = await setPausaAlertas(contacto.id, req.body?.pausadas === true);
    res.json({ ok: true, data });
  });

  r.put('/mio/silencio', async (req, res) => {
    const user = actor(req, res);
    if (!user) return;
    const contacto = await contactoPorUsername(user.username);
    if (!contacto) return res.status(400).json({ ok: false, error: 'No hay número registrado' });
    const silencios = await setSilencio(contacto.id, req.body?.rowKey, req.body?.silenciado === true);
    res.json({ ok: true, data: silencios });
  });

  r.use((req, res, next) => {
    if (!esSuper(actorOf(req))) {
      return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    }
    next();
  });

  r.get('/estado', (_req, res) => {
    res.json({
      ok: true,
      data: estadoWa(),
      cola: colaPendiente(),
      tiempos: {
        gapAlertaSeg: TIEMPOS_WA.gapAlertaMs / 1000,
        gapChatSeg: TIEMPOS_WA.gapChatMs / 1000,
        activoMin: TIEMPOS_WA.activoMs / 60000,
        avisoNoActivoSeg: TIEMPOS_WA.avisoNoActivoMs / 1000,
        respuestasRequeridas: TIEMPOS_WA.respuestasRequeridas,
      },
    });
  });

  r.post('/sesion', async (req, res) => {
    if (!esSuper(actorOf(req))) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    const data = await startWaClient();
    res.json({ ok: true, data });
  });

  r.post('/sesion/reiniciar', async (req, res) => {
    if (!esSuper(actorOf(req))) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    const data = await reiniciarWaClient();
    res.json({ ok: true, data });
  });

  r.post('/prueba-envio', async (req, res) => {
    if (!esSuper(actorOf(req))) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    try {
      const data = await enviarMensajePrueba({
        telefono: req.body?.telefono,
        texto: req.body?.texto,
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e.status || 502).json({ ok: false, error: e.message });
    }
  });

  r.get('/contactos', async (_req, res) => {
    res.json({ ok: true, data: await listarContactos() });
  });

  r.post('/contactos', async (req, res) => {
    try {
      const contacto = await guardarContacto(req.body ?? {});
      if (Array.isArray(req.body?.equipos)) {
        await reemplazarAsignaciones(contacto.id, req.body.equipos);
      }
      const lista = await listarContactos();
      res.json({ ok: true, data: lista.find((c) => c.id === contacto.id) });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.delete('/contactos/:id', async (req, res) => {
    await eliminarContacto(Number(req.params.id));
    res.json({ ok: true });
  });

  r.put('/contactos/:id/equipos', async (req, res) => {
    const id = Number(req.params.id);
    const equipos = await reemplazarAsignaciones(id, req.body?.equipos ?? []);
    res.json({ ok: true, data: equipos });
  });

  r.post('/contactos/:id/prueba', async (req, res) => {
    const contacto = await obtenerContacto(Number(req.params.id));
    if (!contacto) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    const sesion = estadoWa();
    if (sesion.fase !== 'conectado') {
      return res.status(409).json({
        ok: false,
        error: 'Vincula WhatsApp con el QR antes de la prueba de sincronización.',
        data: sesion,
      });
    }
    const actualizado = await iniciarPrueba(contacto.id);
    await enviarPrueba(actualizado);
    res.json({
      ok: true,
      data: actualizado,
      pasos: TIEMPOS_WA.respuestasRequeridas,
      aviso: 'El número debe responder tres veces. Hasta entonces no recibe alertas.',
    });
  });

  r.post('/contactos/:id/aprobar', async (req, res) => {
    const data = await aprobarManual(Number(req.params.id));
    if (!data) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    res.json({ ok: true, data });
  });

  r.post('/contactos/:id/revocar', async (req, res) => {
    const data = await revocar(Number(req.params.id));
    if (!data) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' });
    res.json({ ok: true, data });
  });

  r.get('/chats', async (_req, res) => {
    res.json({ ok: true, data: await listarChats() });
  });

  r.get('/mensajes', async (req, res) => {
    const desde = limiteDia(req.query.desde, false);
    const hasta = limiteDia(req.query.hasta, true);
    const data = await listarMensajes({
      telefono: req.query.telefono ? String(req.query.telefono) : undefined,
      desde,
      hasta,
      limit: Number(req.query.limit ?? (desde || hasta ? 1000 : 100)),
    });
    res.json({ ok: true, data });
  });

  r.post('/usuarios/:username/aprobar', async (req, res) => {
    const user = actorOf(req);
    if (!esSuper(user)) return res.status(403).json({ ok: false, error: 'Se requiere superadmin' });
    const contacto = await contactoPorUsername(req.params.username);
    if (!contacto) return res.status(404).json({ ok: false, error: 'Ese usuario no tiene número de WhatsApp' });
    res.json({ ok: true, data: await aprobarManual(contacto.id) });
  });

  r.get('/export', async (_req, res) => {
    res.json({ ok: true, data: await exportarDatos() });
  });

  r.post('/import', async (req, res) => {
    const contactos = Array.isArray(req.body?.contactos) ? req.body.contactos : [];
    const guardados = [];
    for (const c of contactos) {
      const previo = await obtenerContactoPorTelefono(c.telefono);
      const row = await guardarContacto({
        id: previo?.id,
        nombre: c.nombre,
        telefono: c.telefono,
        activo: c.activo !== false,
      });
      if (Array.isArray(c.equipos)) await reemplazarAsignaciones(row.id, c.equipos);
      guardados.push(row.id);
    }
    res.json({ ok: true, importados: guardados.length });
  });

  return r;
}
