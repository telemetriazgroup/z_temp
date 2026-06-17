import express from 'express';
import nodemailer from 'nodemailer';

const PORT = Number(process.env.CORREO_PORT ?? 3003);
const app = express();

app.use(express.json({ limit: '256kb' }));

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ztrack-correo' });
});

app.post('/reefer/api/correo/send', async (req, res) => {
  const { smtp, to, subject, text, html } = req.body ?? {};

  if (smtp == null || typeof smtp !== 'object') {
    return res.status(400).json({ ok: false, error: 'Falta configuración SMTP' });
  }

  const user = typeof smtp.user === 'string' ? smtp.user.trim() : '';
  const appPassword =
    typeof smtp.appPassword === 'string' ? smtp.appPassword.replace(/\s/g, '') : '';
  const fromName =
    typeof smtp.fromName === 'string' && smtp.fromName.trim()
      ? smtp.fromName.trim()
      : 'ZTRACK Alertas';

  if (!user || !appPassword) {
    return res.status(400).json({ ok: false, error: 'Correo remitente y clave de aplicación son obligatorios' });
  }

  const recipients = Array.isArray(to)
    ? to.map((e) => String(e).trim()).filter(isValidEmail)
    : [];

  if (recipients.length === 0) {
    return res.status(400).json({ ok: false, error: 'Indique al menos un destinatario válido' });
  }

  if (typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ ok: false, error: 'Asunto obligatorio' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass: appPassword },
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: recipients.join(', '),
      subject: subject.trim(),
      text: typeof text === 'string' ? text : undefined,
      html: typeof html === 'string' ? html : undefined,
    });

    return res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al enviar correo';
    console.error('[correo]', msg);
    return res.status(502).json({ ok: false, error: msg });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZTRACK correo API escuchando en :${PORT}`);
});
