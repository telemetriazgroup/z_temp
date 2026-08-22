import type {
  SenalBehaviorReport,
  SenalDeviceHistory,
  SenalEvento,
  SenalJob,
  SenalUbicacion,
} from './types';

const SENAL_BASE =
  import.meta.env.VITE_SENAL_API_BASE ?? '/reefer/api/senal';

function actorHeaders(username: string, superUser: boolean): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-ztrack-user': username,
    'x-ztrack-super-user': superUser ? 'true' : 'false',
  };
}

async function parseRes<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error(
      (body as { error?: string }).error || `HTTP ${res.status}`
    );
  }
  return body;
}

export async function fetchSenalBehavior(opts: {
  anio: number;
  mes: number;
  imei?: string;
  mode?: 'cache' | 'incremental';
  username: string;
  superUser: boolean;
}): Promise<SenalBehaviorReport> {
  const q = new URLSearchParams({
    anio: String(opts.anio),
    mes: String(opts.mes),
    mode: opts.mode ?? 'incremental',
  });
  if (opts.imei) q.set('imei', opts.imei);
  const res = await fetch(`${SENAL_BASE}/behavior?${q}`, {
    headers: actorHeaders(opts.username, opts.superUser),
  });
  const body = await parseRes<{ data: SenalBehaviorReport }>(res);
  return body.data;
}

export async function fetchSenalJob(
  username: string,
  superUser: boolean
): Promise<SenalJob> {
  const res = await fetch(`${SENAL_BASE}/job`, {
    headers: actorHeaders(username, superUser),
  });
  const body = await parseRes<{ data: SenalJob }>(res);
  return body.data;
}

export async function startSenalJob(
  username: string,
  superUser: boolean,
  fromScratch = false
): Promise<SenalJob> {
  const res = await fetch(`${SENAL_BASE}/job/start`, {
    method: 'POST',
    headers: actorHeaders(username, superUser),
    body: JSON.stringify({ fromScratch }),
  });
  const body = await parseRes<{ data: SenalJob }>(res);
  return body.data;
}

export async function pauseSenalJob(
  username: string,
  superUser: boolean
): Promise<SenalJob> {
  const res = await fetch(`${SENAL_BASE}/job/pause`, {
    method: 'POST',
    headers: actorHeaders(username, superUser),
  });
  const body = await parseRes<{ data: SenalJob }>(res);
  return body.data;
}

export async function resumeSenalJob(
  username: string,
  superUser: boolean
): Promise<SenalJob> {
  const res = await fetch(`${SENAL_BASE}/job/resume`, {
    method: 'POST',
    headers: actorHeaders(username, superUser),
  });
  const body = await parseRes<{ data: SenalJob }>(res);
  return body.data;
}

export async function fetchSenalDeviceHistory(opts: {
  imei: string;
  username: string;
  superUser: boolean;
}): Promise<SenalDeviceHistory> {
  const res = await fetch(
    `${SENAL_BASE}/devices/${encodeURIComponent(opts.imei)}`,
    { headers: actorHeaders(opts.username, opts.superUser) }
  );
  const body = await parseRes<{ data: SenalDeviceHistory }>(res);
  return body.data;
}

export async function saveSenalUbicacion(
  imei: string,
  payload: Partial<SenalUbicacion>,
  username: string,
  superUser: boolean
): Promise<SenalUbicacion> {
  const res = await fetch(
    `${SENAL_BASE}/ubicaciones/${encodeURIComponent(imei)}`,
    {
      method: 'PUT',
      headers: actorHeaders(username, superUser),
      body: JSON.stringify(payload),
    }
  );
  const body = await parseRes<{ data: SenalUbicacion }>(res);
  return body.data;
}

export async function createSenalEvento(
  payload: {
    imei: string;
    episodioId?: number | null;
    tipo?: string;
    titulo?: string;
    nota?: string;
    occurredAt?: string;
  },
  username: string,
  superUser: boolean
): Promise<SenalEvento> {
  const res = await fetch(`${SENAL_BASE}/eventos`, {
    method: 'POST',
    headers: actorHeaders(username, superUser),
    body: JSON.stringify(payload),
  });
  const body = await parseRes<{ data: SenalEvento & Record<string, unknown> }>(res);
  const raw = body.data;
  return {
    id: Number(raw.id),
    imei: String(raw.imei),
    episodioId: (raw.episodioId ?? raw.episodio_id ?? null) as number | null,
    tipo: String(raw.tipo ?? 'otro'),
    titulo: (raw.titulo ?? null) as string | null,
    nota: (raw.nota ?? null) as string | null,
    occurredAt: (raw.occurredAt ?? raw.occurred_at ?? null) as string | null,
    createdAt: (raw.createdAt ?? raw.created_at ?? null) as string | null,
    createdBy: (raw.createdBy ?? raw.created_by ?? null) as string | null,
  };
}

export async function deleteSenalEvento(
  id: number,
  imei: string,
  username: string,
  superUser: boolean
): Promise<void> {
  const q = new URLSearchParams({ imei });
  const res = await fetch(`${SENAL_BASE}/eventos/${id}?${q}`, {
    method: 'DELETE',
    headers: actorHeaders(username, superUser),
  });
  await parseRes<{ data: { id: number } }>(res);
}
