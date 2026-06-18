import { readJson, writeJson } from './store.js';

const FILE = 'smtp.json';

/** Configuración SMTP persistida en base interna (JSON en /app/server/data). */
export function getSmtpConfig() {
  return readJson(FILE, null);
}

export function saveSmtpConfig(input) {
  const prev = getSmtpConfig() ?? {};
  const user = typeof input.user === 'string' ? input.user.trim() : prev.user ?? '';
  const appPassword =
    typeof input.appPassword === 'string' && input.appPassword.trim()
      ? input.appPassword.replace(/\s/g, '')
      : prev.appPassword ?? '';
  const fromName =
    typeof input.fromName === 'string' && input.fromName.trim()
      ? input.fromName.trim()
      : prev.fromName ?? 'ZTRACK TELEMETRY';

  if (!user) {
    throw new Error('Correo remitente obligatorio');
  }
  if (!appPassword) {
    throw new Error('Clave de aplicación obligatoria (indíquela al crear o al cambiar)');
  }

  const saved = {
    user,
    appPassword,
    fromName,
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, saved);
  console.log(`[correo] SMTP guardado en base interna: ${user}`);
  return saved;
}

export function smtpPublicView(smtp) {
  if (!smtp) return null;
  return {
    user: smtp.user,
    fromName: smtp.fromName ?? 'ZTRACK TELEMETRY',
    hasPassword: Boolean(smtp.appPassword),
    updatedAt: smtp.updatedAt ?? null,
  };
}
