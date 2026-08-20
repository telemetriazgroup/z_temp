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
  DeviceAlertConfig,
  DeviceAlertStateView,
  ReferenciaUpdateResult,
  DeviceEventosView,
  DashboardOverview,
} from './types';
import type { DeviceLocalNameHistoryEntry } from '../../lib/deviceLocalNames';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function headers(user?: string | null, superUser?: boolean): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.trim()) h['X-ZTrack-User'] = user.trim();
  if (superUser) h['X-ZTrack-Super-User'] = 'true';
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

export async function fetchServerSmtp(actingUser?: string | null): Promise<SmtpConfigServerView | null> {
  const res = await fetch(`${BASE}/config/smtp`, {
    headers: headers(actingUser, true),
  });
  const body = await parseRes<{ data: SmtpConfigServerView | null }>(res);
  return body.data;
}

export async function saveServerSmtp(
  config: SmtpConfigSaveInput,
  actingUser?: string | null
): Promise<SmtpConfigServerView> {
  const payload: SmtpConfigSaveInput = {
    user: config.user.trim(),
    fromName: config.fromName.trim() || 'ZTRACK TELEMETRY',
  };
  const pass = config.appPassword?.replace(/\s/g, '') ?? '';
  if (pass) payload.appPassword = pass;

  const res = await fetch(`${BASE}/config/smtp`, {
    method: 'PUT',
    headers: headers(actingUser, true),
    body: JSON.stringify(payload),
  });
  const body = await parseRes<{ data: SmtpConfigServerView }>(res);
  return body.data;
}

export async function fetchServerGrupos(actingUser?: string | null): Promise<GrupoCorreo[]> {
  const res = await fetch(`${BASE}/grupos`, {
    headers: headers(actingUser),
  });
  const body = await parseRes<{ data: GrupoCorreo[] }>(res);
  return body.data;
}

export async function saveServerGrupo(
  grupo: GrupoCorreo,
  actingUser?: string | null
): Promise<GrupoCorreo> {
  const res = await fetch(`${BASE}/grupos`, {
    method: 'POST',
    headers: headers(actingUser),
    body: JSON.stringify(grupo),
  });
  const body = await parseRes<{ data: GrupoCorreo }>(res);
  return body.data;
}

export async function syncDeviceNamesToServer(names: Record<string, string>): Promise<number> {
  const res = await fetch(`${BASE}/device-names/sync`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ names }),
  });
  const body = await parseRes<{ count: number }>(res);
  return body.count;
}

export async function fetchDeviceNamesFromServer(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/device-names`);
  const body = await parseRes<{ data: { namesByRowKey: Record<string, string> } }>(res);
  return body.data?.namesByRowKey ?? {};
}

export async function saveDeviceNameOnServer(params: {
  rowKey: string;
  imei: string;
  codigo?: string;
  name: string;
  usuario?: string;
}): Promise<{ name: string | null; historyEntry: DeviceLocalNameHistoryEntry | null }> {
  const res = await fetch(`${BASE}/device-names`, {
    method: 'POST',
    headers: headers(params.usuario),
    body: JSON.stringify(params),
  });
  const body = await parseRes<{
    data: {
      name: string | null;
      historyEntry: DeviceLocalNameHistoryEntry | null;
    };
  }>(res);
  return body.data;
}

export async function fetchDeviceNameHistoryFromServer(
  rowKey: string,
  limit = 20
): Promise<DeviceLocalNameHistoryEntry[]> {
  const q = new URLSearchParams({ rowKey, limit: String(limit) });
  const res = await fetch(`${BASE}/device-names/history?${q.toString()}`);
  const body = await parseRes<{
    data: DeviceLocalNameHistoryEntry[];
  }>(res);
  return body.data ?? [];
}

export async function replaceServerGrupos(grupos: GrupoCorreo[]): Promise<void> {
  const res = await fetch(`${BASE}/grupos`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ grupos }),
  });
  await parseRes(res);
}

export async function deleteServerGrupo(
  id: string,
  actingUser?: string | null
): Promise<void> {
  const res = await fetch(`${BASE}/grupos/${id}`, {
    method: 'DELETE',
    headers: headers(actingUser),
  });
  await parseRes(res);
}

export async function fetchServerEnvios(limit = 100): Promise<CorreoEnvioLog[]> {
  const res = await fetch(`${BASE}/envios?limit=${limit}`);
  const body = await parseRes<{ data: CorreoEnvioLog[] }>(res);
  return body.data;
}

export async function fetchServerIncidentes(params?: {
  imeis?: string[];
  rowKeys?: string[];
  estado?: 'pendiente' | 'atendida' | 'cerrado';
  todos?: boolean;
  incluirArchivados?: boolean;
}): Promise<{ data: CorreoIncidente[]; meta: { hoy: string; ayer: string } }> {
  const q = new URLSearchParams();
  if (!params?.todos) {
    if (params?.rowKeys?.length) q.set('rowKey', params.rowKeys.join(','));
    else if (params?.imeis?.length) q.set('imei', params.imeis.join(','));
  }
  if (params?.estado) q.set('estado', params.estado);
  if (params?.incluirArchivados) q.set('incluirArchivados', 'true');
  const res = await fetch(`${BASE}/incidentes?${q.toString()}`);
  return parseRes(res);
}

/** Archiva un incidente (permanece en base de datos). */
export async function archiveIncidente(id: string, usuario: string): Promise<CorreoIncidente> {
  const res = await fetch(`${BASE}/incidentes/${id}`, {
    method: 'DELETE',
    headers: headers(usuario, true),
  });
  const body = await parseRes<{ data: CorreoIncidente }>(res);
  return body.data;
}

/** @deprecated usar archiveIncidente */
export async function deleteIncidente(id: string, usuario: string): Promise<void> {
  await archiveIncidente(id, usuario);
}

export async function archiveAllIncidentes(usuario: string): Promise<{ count: number }> {
  const res = await fetch(`${BASE}/incidentes/archivar-todos`, {
    method: 'POST',
    headers: headers(usuario, true),
  });
  const body = await parseRes<{ count: number }>(res);
  return { count: body.count };
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

export async function fetchServerCiclos(
  limit = 30,
  actingUser?: string | null
): Promise<CorreoCicloAnalisis[]> {
  const res = await fetch(`${BASE}/ciclos?limit=${limit}`, {
    headers: headers(actingUser, true),
  });
  const body = await parseRes<{ data: CorreoCicloAnalisis[] }>(res);
  return body.data;
}

export async function fetchServerCiclo(
  id: string,
  actingUser?: string | null
): Promise<CorreoCicloAnalisis> {
  const res = await fetch(`${BASE}/ciclos/${id}`, {
    headers: headers(actingUser, true),
  });
  const body = await parseRes<{ data: CorreoCicloAnalisis }>(res);
  return body.data;
}

export async function fetchDeviceAlertConfigMap(): Promise<Record<string, DeviceAlertConfig>> {
  const res = await fetch(`${BASE}/alert-config`);
  const body = await parseRes<{ data: Record<string, DeviceAlertConfig> }>(res);
  return body.data ?? {};
}

export async function fetchDeviceAlertState(
  actingUser?: string | null
): Promise<DeviceAlertStateView> {
  const res = await fetch(`${BASE}/alert-config/state`, {
    headers: headers(actingUser),
  });
  const body = await parseRes<{ data: DeviceAlertStateView }>(res);
  return body.data;
}

export async function fetchDeviceEventos(rowKey: string): Promise<DeviceEventosView> {
  const res = await fetch(`${BASE}/alert-config/${encodeURIComponent(rowKey)}/eventos`);
  const body = await parseRes<{ data: DeviceEventosView }>(res);
  return body.data;
}

export async function saveDeviceAlertConfigApi(
  rowKey: string,
  config: {
    mode: 'standard' | 'custom';
    umbralesHoras?: number[];
    useReferenciaManual?: boolean;
    referenciaManual?: string;
    alerta1Hora?: boolean;
    alerta30Minutos?: boolean;
    useRangoPersonalizado?: boolean;
    margenInferior?: number;
    margenSuperior?: number;
  },
  actingUser?: string | null
): Promise<DeviceAlertConfig | null> {
  const res = await fetch(`${BASE}/alert-config/${encodeURIComponent(rowKey)}`, {
    method: 'PUT',
    headers: headers(actingUser),
    body: JSON.stringify(config),
  });
  const body = await parseRes<{ data: DeviceAlertConfig | null }>(res);
  return body.data;
}

export async function updateDeviceReferencia(
  rowKey: string,
  payload:
    | { action: 'historial' }
    | { action: 'manual'; since: string; resetSentUmbrales?: boolean }
): Promise<ReferenciaUpdateResult> {
  const res = await fetch(`${BASE}/alert-config/${encodeURIComponent(rowKey)}/referencia`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const body = await parseRes<{ data: ReferenciaUpdateResult }>(res);
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

export async function fetchDashboardOverview(opts?: {
  username?: string | null;
  superUser?: boolean;
}): Promise<DashboardOverview> {
  const res = await fetch(`${BASE}/dashboard/overview`, {
    headers: headers(opts?.username, opts?.superUser),
  });
  const body = await parseRes<{ data: DashboardOverview }>(res);
  return body.data;
}

export async function markDashboardDeviceReviewed(
  rowKey: string,
  status: 'revisado' | 'ignorado' | 'pendiente',
  opts?: { username?: string | null; superUser?: boolean }
): Promise<void> {
  const res = await fetch(
    `${BASE}/dashboard/devices/${encodeURIComponent(rowKey)}/review`,
    {
      method: 'POST',
      headers: headers(opts?.username, opts?.superUser),
      body: JSON.stringify({ status }),
    }
  );
  await parseRes(res);
}

export async function fetchDashboardUserActivity(
  targetUsername: string,
  opts?: { username?: string | null; superUser?: boolean; limit?: number }
): Promise<import('./types').DashboardUserActivityDetail> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  const res = await fetch(
    `${BASE}/dashboard/users/${encodeURIComponent(targetUsername)}/activity?${q.toString()}`,
    { headers: headers(opts?.username, opts?.superUser) }
  );
  const body = await parseRes<{
    data: import('./types').DashboardUserActivityDetail;
  }>(res);
  return body.data;
}
