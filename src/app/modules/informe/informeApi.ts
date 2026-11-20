const BASE = '/reefer/api/informes';

function sessionHeaders(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem('ztrack_user');
    if (!raw) return h;
    const user = JSON.parse(raw) as { username?: string; superUser?: boolean; category?: string };
    if (user.username?.trim()) h['X-ZTrack-User'] = user.username.trim();
    if (user.superUser === true || user.category === 'superadmin') {
      h['X-ZTrack-Super-User'] = 'true';
    }
  } catch {
    /* sin sesión */
  }
  return h;
}

export type EquipoInforme = { imei: string; codigo: string | null; nombre: string | null };

export type InformeJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  log: string[];
  error: string | null;
  result: {
    nombre?: string;
    registros?: number;
    dias?: number;
    paginas?: number;
    filas_reconstruidas?: number;
    huecos?: number;
    cumplimiento?: number;
    horas_en_rango_prom?: number;
    set_point?: number;
    pdfs?: string[];
    datos?: string | null;
    resumen?: string | null;
    huecos_csv?: string | null;
  } | null;
};

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Error ${res.status}`);
  }
  return body as T;
}

export async function fetchEquiposInforme(): Promise<EquipoInforme[]> {
  const res = await fetch(`${BASE}/equipos`, { headers: sessionHeaders() });
  const body = await parse<{ data: EquipoInforme[] }>(res);
  return body.data;
}

export async function generarInforme(input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/generar`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(input),
  });
  const body = await parse<{ data: { id: string } }>(res);
  return body.data.id;
}

export async function fetchInformeJob(id: string): Promise<InformeJob> {
  const res = await fetch(`${BASE}/job/${encodeURIComponent(id)}`, { headers: sessionHeaders() });
  const body = await parse<{ data: InformeJob }>(res);
  return body.data;
}

export async function descargarArchivoInforme(jobId: string, nombre: string): Promise<void> {
  const headers = sessionHeaders();
  delete (headers as Record<string, string>)['Content-Type'];
  const res = await fetch(
    `${BASE}/job/${encodeURIComponent(jobId)}/archivo/${encodeURIComponent(nombre)}`,
    { headers }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Error ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
