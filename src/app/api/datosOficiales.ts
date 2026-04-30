import type { BuscarDatosOficialesResponse, DispositivoOrigenCodigo } from '../types';
import {
  TELEMETRY_STARCOOL_BASE,
  TELEMETRY_TUNEL_TERMOKING_BASE,
} from './telemetryBases';

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
      return `${TELEMETRY_TUNEL_TERMOKING_BASE}/Tunel/buscar_datos_oficiales/${safe}`;
    case 'TERMOKING':
      return `${TELEMETRY_TUNEL_TERMOKING_BASE}/TermoKing/buscar_datos_oficiales/${safe}`;
    case 'STARCOOL':
      return `${TELEMETRY_STARCOOL_BASE}/Starcool/buscar_datos_oficiales/${safe}`;
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
