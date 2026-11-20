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

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `Error ${res.status}`);
  return body;
}

export type EquipoCampana = { imei: string; codigo: string; nombre: string };

export type CampanaInforme = {
  id: string;
  cliente: string;
  equipos: EquipoCampana[];
  periodo: 'semana_anterior' | 'mes_anterior' | 'rango';
  desde: string | null;
  hasta: string | null;
  programacion?: 'semanal' | 'manual' | 'mensual';
  dia: number;
  diaSemana?: number;
  hora: number;
  minuto: number;
  emails: string[];
  emailsAdmin?: string[];
  tolerancia: number;
  activo: boolean;
  ultimoPeriodo: string | null;
  owner: string;
  ultimaCorrida: {
    id: string;
    estado: string;
    desde: string;
    hasta: string;
    clienteCarpetaUrl: string | null;
  } | null;
};

export type DiaCorrida = {
  dia: string;
  horas_fuera_rango?: number;
  horas_defrost?: number;
  horas_fuera_total?: number;
  pendiente: boolean;
};

export type TareaCorrida = {
  imei: string;
  codigo: string;
  nombre: string;
  desde: string;
  hasta: string;
  ruta: string;
  estado: string;
  error: string | null;
  carpetaUrl: string | null;
  horasFuera: number | null;
  horasDefrost: number | null;
  horasFueraTotal: number | null;
  dias: DiaCorrida[];
};

export type CorridaCampana = {
  id: string;
  campanaId: string;
  desde: string;
  hasta: string;
  manual: boolean;
  estado: string;
  clienteCarpetaUrl: string | null;
  mailError: string | null;
  resumenUrl: string | null;
  urgenteError: string | null;
  avance: { total: number; subido: number; error: number; pendiente: number; sinDatos?: number };
  tareas: TareaCorrida[];
};

export async function fetchCampanas(): Promise<CampanaInforme[]> {
  const res = await fetch(`${BASE}/campanas`, { headers: sessionHeaders() });
  const body = await parse<{ data: CampanaInforme[] }>(res);
  return body.data;
}

export async function guardarCampana(
  input: Partial<CampanaInforme> & { equipos: EquipoCampana[] },
  id?: string
): Promise<CampanaInforme> {
  const res = await fetch(id ? `${BASE}/campanas/${id}` : `${BASE}/campanas`, {
    method: id ? 'PUT' : 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(input),
  });
  const body = await parse<{ data: CampanaInforme }>(res);
  return body.data;
}

export async function borrarCampana(id: string): Promise<void> {
  const res = await fetch(`${BASE}/campanas/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  await parse(res);
}

export async function lanzarCampana(id: string): Promise<CorridaCampana> {
  const res = await fetch(`${BASE}/campanas/${id}/lanzar`, {
    method: 'POST',
    headers: sessionHeaders(),
  });
  const body = await parse<{ data: CorridaCampana }>(res);
  return body.data;
}

export async function ajustarDiaCorrida(
  runId: string,
  input: { imei: string; codigo: string; desde: string; dia: string; modo: 'horas' | 'temperatura'; valor: number }
): Promise<CorridaCampana> {
  const res = await fetch(`${BASE}/corridas/${runId}/ajustar`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(input),
  });
  const body = await parse<{ data: CorridaCampana }>(res);
  return body.data;
}

export async function fetchCorrida(id: string): Promise<CorridaCampana> {
  const res = await fetch(`${BASE}/corridas/${id}`, { headers: sessionHeaders() });
  const body = await parse<{ data: CorridaCampana }>(res);
  return body.data;
}
