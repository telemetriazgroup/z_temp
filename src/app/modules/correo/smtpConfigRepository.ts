import type { SmtpConfig } from './types';

const STORAGE_KEY = 'ztrack_smtp_config_v1';

export function readSmtpConfig(): SmtpConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<SmtpConfig>;
    if (!parsed.user?.trim() || !parsed.appPassword?.trim()) return null;
    return {
      user: parsed.user.trim(),
      appPassword: parsed.appPassword.replace(/\s/g, ''),
      fromName: parsed.fromName?.trim() || 'ZTRACK Alertas',
    };
  } catch {
    return null;
  }
}

export function persistSmtpConfig(config: SmtpConfig): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      user: config.user.trim(),
      appPassword: config.appPassword.replace(/\s/g, ''),
      fromName: config.fromName.trim() || 'ZTRACK Alertas',
    })
  );
}

export function clearSmtpConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
