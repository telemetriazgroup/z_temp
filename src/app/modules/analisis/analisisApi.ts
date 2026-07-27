import type {
  AnalisisClasificacion,
  AnalisisCompleto,
  AnalisisEvento,
  AnalisisSeriePunto,
} from './types';

const BASE = import.meta.env.VITE_ANALISIS_API_BASE ?? '/reefer/api/analisis';

function headers(user?: string | null, superUser?: boolean): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.trim()) h['X-ZTrack-User'] = user.trim();
  if (superUser) h['X-ZTrack-Super-User'] = 'true';
  return h;
}

async function parseRes<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return undefined as T;
  }
  const body = (await res.json()) as T & { ok?: boolean; error?: string; data?: unknown };
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return body;
}

export async function fetchAnalisisMensual(params: {
  imei: string;
  codigo: string;
  anio: number;
  mes: number;
  user?: string | null;
  superUser?: boolean;
}): Promise<AnalisisCompleto | null> {
  const q = new URLSearchParams({
    imei: params.imei,
    codigo: params.codigo,
    anio: String(params.anio),
    mes: String(params.mes),
  });
  const res = await fetch(`${BASE}/mensual?${q}`, {
    headers: headers(params.user, params.superUser),
  });
  const body = await parseRes<{ data: AnalisisCompleto | null }>(res);
  return body.data;
}

export async function runAnalisisMensual(params: {
  imei: string;
  codigo: string;
  anio: number;
  mes: number;
  regenerar?: boolean;
  rangoAnalisis?: {
    setPoint?: number | null;
    bandaMin?: number | null;
    bandaMax?: number | null;
    margenInferior?: number | null;
    margenSuperior?: number | null;
    useRangoPersonalizado?: boolean;
  } | null;
  user?: string | null;
  superUser?: boolean;
}): Promise<AnalisisCompleto> {
  const res = await fetch(`${BASE}/mensual/run`, {
    method: 'POST',
    headers: headers(params.user, params.superUser),
    body: JSON.stringify({
      imei: params.imei,
      codigo: params.codigo,
      anio: params.anio,
      mes: params.mes,
      regenerar: params.regenerar === true,
      rangoAnalisis: params.rangoAnalisis ?? null,
    }),
  });
  const body = await parseRes<{ data: AnalisisCompleto }>(res);
  return body.data;
}

export async function patchAnalisisEvento(params: {
  eventoId: string;
  clasificacion: AnalisisClasificacion;
  detalle?: string;
  user?: string | null;
  superUser?: boolean;
}): Promise<AnalisisEvento> {
  const res = await fetch(`${BASE}/eventos/${params.eventoId}`, {
    method: 'PATCH',
    headers: headers(params.user, params.superUser),
    body: JSON.stringify({
      clasificacion: params.clasificacion,
      detalle: params.detalle,
    }),
  });
  const body = await parseRes<{ data: AnalisisEvento }>(res);
  return body.data;
}

export async function fetchEventoSerie(params: {
  eventoId: string;
  user?: string | null;
  superUser?: boolean;
}): Promise<{ evento: AnalisisEvento; serie: AnalisisSeriePunto[] }> {
  const res = await fetch(`${BASE}/eventos/${params.eventoId}/serie`, {
    headers: headers(params.user, params.superUser),
  });
  const body = await parseRes<{
    data: { evento: AnalisisEvento; serie: AnalisisSeriePunto[] };
  }>(res);
  return body.data;
}

export async function interpolarHuecoEvento(params: {
  eventoId: string;
  user?: string | null;
  superUser?: boolean;
}): Promise<{ count: number }> {
  const res = await fetch(`${BASE}/huecos/${params.eventoId}/interpolar`, {
    method: 'POST',
    headers: headers(params.user, params.superUser),
    body: '{}',
  });
  const body = await parseRes<{ data: { count: number } }>(res);
  return body.data;
}

export function analisisExportUrl(
  analisisId: string,
  format: 'csv' | 'xlsx'
): string {
  return `${BASE}/mensual/${analisisId}/export.${format}`;
}
