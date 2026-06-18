import type {
  SmtpConfig,
  GrupoCorreo,
  CorreoEnvioLog,
  CorreoIncidente,
  CorreoServerStatus,
  AlertEngineResult,
  SendEmailPayload,
  SendEmailResult,
  SmtpConfigServerView,
  SmtpConfigSaveInput,
  CorreoCicloAnalisis,
  CicloEvaluacionDispositivo,
  CicloEvaluacionEstado,
  CicloResumen,
} from './types';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function headers(user?: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.trim()) h['X-ZTrack-User'] = user.trim();
  return h;
}

async function parseRes<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return body;
}

export async function fetchCorreoStatus(): Promise<CorreoServerStatus> {
  const res = await fetch(`${BASE}/status`);
  const body = await parseRes<{
    smtpConfigured: boolean;
    smtpUpdatedAt?: string | null;
    gruposActivos: number;
    lastRun: AlertEngineResult | null;
    incidentesPendientes: number;
  }>(res);
  return {
    smtpConfigured: body.smtpConfigured,
    smtpUpdatedAt: body.smtpUpdatedAt ?? null,
    gruposActivos: body.gruposActivos,
    lastRun: body.lastRun,
    incidentesPendientes: body.incidentesPendientes,
  };
}

export async function fetchServerSmtp(): Promise<SmtpConfigServerView | null> {
  const res = await fetch(`${BASE}/config/smtp`);
  const body = await parseRes<{ data: SmtpConfigServerView | null }>(res);
  return body.data;
}

export async function saveServerSmtp(config: SmtpConfigSaveInput): Promise<SmtpConfigServerView> {
  const payload: SmtpConfigSaveInput = {
    user: config.user.trim(),
    fromName: config.fromName.trim() || 'ZTRACK TELEMETRY',
  };
  const pass = config.appPassword?.replace(/\s/g, '') ?? '';
  if (pass) payload.appPassword = pass;

  const res = await fetch(`${BASE}/config/smtp`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const body = await parseRes<{ data: SmtpConfigServerView }>(res);
  return body.data;
}

export async function fetchServerGrupos(): Promise<GrupoCorreo[]> {
  const res = await fetch(`${BASE}/grupos`);
  const body = await parseRes<{ data: GrupoCorreo[] }>(res);
  return body.data;
}

export async function saveServerGrupo(grupo: GrupoCorreo): Promise<GrupoCorreo> {
  const res = await fetch(`${BASE}/grupos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(grupo),
  });
  const body = await parseRes<{ data: GrupoCorreo }>(res);
  return body.data;
}

export async function replaceServerGrupos(grupos: GrupoCorreo[]): Promise<void> {
  const res = await fetch(`${BASE}/grupos`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ grupos }),
  });
  await parseRes(res);
}

export async function deleteServerGrupo(id: string): Promise<void> {
  const res = await fetch(`${BASE}/grupos/${id}`, { method: 'DELETE' });
  await parseRes(res);
}

export async function fetchServerEnvios(limit = 100): Promise<CorreoEnvioLog[]> {
  const res = await fetch(`${BASE}/envios?limit=${limit}`);
  const body = await parseRes<{ data: CorreoEnvioLog[] }>(res);
  return body.data;
}

export async function fetchServerIncidentes(params?: {
  imeis?: string[];
  estado?: 'pendiente' | 'atendida';
}): Promise<{ data: CorreoIncidente[]; meta: { hoy: string; ayer: string } }> {
  const q = new URLSearchParams();
  if (params?.imeis?.length) q.set('imei', params.imeis.join(','));
  if (params?.estado) q.set('estado', params.estado);
  const res = await fetch(`${BASE}/incidentes?${q.toString()}`);
  return parseRes(res);
}

export async function comentarIncidente(
  id: string,
  texto: string,
  usuario: string
): Promise<CorreoIncidente> {
  const res = await fetch(`${BASE}/incidentes/${id}`, {
    method: 'PATCH',
    headers: headers(usuario),
    body: JSON.stringify({ action: 'comentar', texto, usuario }),
  });
  const body = await parseRes<{ data: CorreoIncidente }>(res);
  return body.data;
}

export async function atenderIncidente(
  id: string,
  usuario: string,
  texto?: string
): Promise<CorreoIncidente> {
  const res = await fetch(`${BASE}/incidentes/${id}`, {
    method: 'PATCH',
    headers: headers(usuario),
    body: JSON.stringify({ action: 'atender', texto, usuario }),
  });
  const body = await parseRes<{ data: CorreoIncidente }>(res);
  return body.data;
}

export async function runServerAlertCycle(): Promise<CorreoCicloAnalisis> {
  const res = await fetch(`${BASE}/run`, { method: 'POST' });
  return parseRes(res);
}

export async function fetchServerCiclos(limit = 30): Promise<CorreoCicloAnalisis[]> {
  const res = await fetch(`${BASE}/ciclos?limit=${limit}`);
  const body = await parseRes<{ data: CorreoCicloAnalisis[] }>(res);
  return body.data;
}

export async function fetchServerCiclo(id: string): Promise<CorreoCicloAnalisis> {
  const res = await fetch(`${BASE}/ciclos/${id}`);
  const body = await parseRes<{ data: CorreoCicloAnalisis }>(res);
  return body.data;
}

export async function clearCorreoHistorial(options?: {
  envios?: boolean;
  ciclos?: boolean;
  incidentes?: boolean;
  episodios?: boolean;
}): Promise<string[]> {
  const res = await fetch(`${BASE}/historial/limpiar`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(options ?? {}),
  });
  const body = await parseRes<{ cleared: string[] }>(res);
  return body.cleared;
}

export async function migrateLocalCorreoToServer(payload: {
  smtp?: SmtpConfig | null;
  grupos?: GrupoCorreo[];
}): Promise<void> {
  const res = await fetch(`${BASE}/migrate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  await parseRes(res);
}

export async function sendEmailViaApi(payload: SendEmailPayload): Promise<SendEmailResult> {
  const res = await fetch(`${BASE}/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseRes(res);
}

export async function sendTestEmailViaServer(payload: Omit<SendEmailPayload, 'smtp'> & { smtp?: SmtpConfig }): Promise<SendEmailResult> {
  const res = await fetch(`${BASE}/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseRes(res);
}
