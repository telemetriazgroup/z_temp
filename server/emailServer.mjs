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
} from './lib/alertEngine.js';
import { getSmtpConfig, saveSmtpConfig, smtpPublicView } from './lib/smtpRepository.js';
import { buildFueraDeRangoEmail } from './lib/emailBuilder.js';

const PORT = Number(process.env.CORREO_PORT ?? 3003);
const POLL_MS = Number(process.env.CORREO_POLL_MS ?? 2 * 60 * 1000);
const app = express();

app.use(express.json({ limit: '512kb' }));

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
    incidentesPendientes: getIncidentes().filter((i) => i.estado === 'pendiente').length,
  });
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
  const { imei, estado, dia } = req.query;
  const imeis = typeof imei === 'string' && imei ? imei.split(',') : null;
  let list = getIncidentes();
  if (imeis) list = list.filter((i) => imeis.includes(i.imei));
  if (estado === 'pendiente' || estado === 'atendida') {
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

app.post('/reefer/api/correo/run', async (_req, res) => {
  try {
    const result = await runAlertCycle();
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
  console.log(`ZTRACK correo API :${PORT} · ciclo cada ${POLL_MS / 1000}s`);
  setTimeout(() => {
    runAlertCycle().catch((e) => console.error('[correo] ciclo inicial', e.message));
  }, 5000);
  setInterval(() => {
    runAlertCycle().catch((e) => console.error('[correo] ciclo', e.message));
  }, POLL_MS);
});
