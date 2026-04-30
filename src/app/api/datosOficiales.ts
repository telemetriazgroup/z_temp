import type { BuscarDatosOficialesResponse, DispositivoOrigenCodigo } from '../types';

const BASE_TUNEL_TERMOKING =
  import.meta.env.VITE_TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const BASE_STARCOOL =
  import.meta.env.VITE_STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';

const ORIGENES_CON_HISTORIAL = new Set<DispositivoOrigenCodigo>([
  'TUNEL',
  'TERMOKING',
  'STARCOOL',
]);

export function dispositivoTieneHistorialOficial(
  codigo: DispositivoOrigenCodigo | undefined
): codigo is DispositivoOrigenCodigo {
  return codigo != null && ORIGENES_CON_HISTORIAL.has(codigo);
}

function construirUrlBuscarDatosOficiales(
  codigo: DispositivoOrigenCodigo,
  imei: string
): string {
  const safe = encodeURIComponent(imei);
  switch (codigo) {
    case 'TUNEL':
      return `${BASE_TUNEL_TERMOKING}/Tunel/buscar_datos_oficiales/${safe}`;
    case 'TERMOKING':
      return `${BASE_TUNEL_TERMOKING}/TermoKing/buscar_datos_oficiales/${safe}`;
    case 'STARCOOL':
      return `${BASE_STARCOOL}/Starcool/buscar_datos_oficiales/${safe}`;
  }
}

function parseRespuesta(json: unknown): BuscarDatosOficialesResponse {
  const root = json as BuscarDatosOficialesResponse | null;
  if (root == null || typeof root !== 'object') {
    throw new Error('Respuesta inválida');
  }
  if (root.code !== 200) {
    throw new Error(root.message ?? `Error código ${root.code}`);
  }
  if (root.data == null || !Array.isArray(root.data.datos)) {
    throw new Error('Respuesta inválida: falta data.datos');
  }
  return root;
}

export async function fetchBuscarDatosOficiales(
  codigo: DispositivoOrigenCodigo,
  imei: string,
  filtro?: { fechaInicial: Date; fechaFinal: Date }
): Promise<BuscarDatosOficialesResponse> {
  let url = construirUrlBuscarDatosOficiales(codigo, imei);
  if (filtro != null) {
    const params = new URLSearchParams({
      fecha_inicial: formatoFechaQueryApi(filtro.fechaInicial),
      fecha_final: formatoFechaQueryApi(filtro.fechaFinal),
    });
    url = `${url}?${params.toString()}`;
  }
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return parseRespuesta(await res.json());
}

/** Formato esperado por la API: `2026-04-29_20-11-11` */
function formatoFechaQueryApi(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
