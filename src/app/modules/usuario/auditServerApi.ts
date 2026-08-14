import type { AuditLogEntry } from '../../types';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

function headers(username?: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (username?.trim()) h['X-ZTrack-User'] = username.trim();
  return h;
}

async function parseRes<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return body;
}

export type AuditLogQuery = {
  limit?: number;
  offset?: number;
  actorUsername?: string;
  action?: string;
  module?: string;
  from?: string;
  to?: string;
  q?: string;
};

export async function fetchAuditLog(
  actingUser: string,
  opts?: AuditLogQuery
): Promise<{ total: number; data: AuditLogEntry[] }> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.offset != null) q.set('offset', String(opts.offset));
  if (opts?.actorUsername) q.set('actor', opts.actorUsername);
  if (opts?.action) q.set('action', opts.action);
  if (opts?.module) q.set('module', opts.module);
  if (opts?.from) q.set('from', opts.from);
  if (opts?.to) q.set('to', opts.to);
  if (opts?.q) q.set('q', opts.q);
  const res = await fetch(`${BASE}/audit?${q.toString()}`, {
    headers: headers(actingUser),
  });
  const body = await parseRes<{ data: AuditLogEntry[]; total: number }>(res);
  return { total: body.total, data: body.data };
}

export async function postAuditEvent(
  actingUser: string,
  event: {
    action: string;
    module?: string;
    summary: string;
    targetUsername?: string;
    targetId?: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await fetch(`${BASE}/audit`, {
      method: 'POST',
      headers: headers(actingUser),
      body: JSON.stringify(event),
    });
  } catch {
    // no bloquear UI si falla el registro
  }
}
