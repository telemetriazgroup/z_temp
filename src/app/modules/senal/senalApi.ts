import type { SenalBehaviorReport, SenalUbicacion } from './types';

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
  username: string;
  superUser: boolean;
}): Promise<SenalBehaviorReport> {
  const q = new URLSearchParams({
    anio: String(opts.anio),
    mes: String(opts.mes),
  });
  if (opts.imei) q.set('imei', opts.imei);
  const res = await fetch(`${SENAL_BASE}/behavior?${q}`, {
    headers: actorHeaders(opts.username, opts.superUser),
  });
  const body = await parseRes<{ data: SenalBehaviorReport }>(res);
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
