import type {
  DispositivoOrigenCodigo,
  UltimoEstadoDispositivosResponse,
} from '../types';
import {
  TELEMETRY_STARCOOL_BASE,
  TELEMETRY_STARCOOL2_BASE,
  TELEMETRY_TUNEL_TERMOKING_BASE,
} from './telemetryBases';
import { mergeStarcoolOrigenes } from './mergeStarcoolOrigenes';
import { resumenFromDispositivos } from '../modules/usuario/listResumen';

const SOURCE_TUNEL =
  import.meta.env.VITE_TUNEL_ULTIMO_ESTADO_URL ??
  `${TELEMETRY_TUNEL_TERMOKING_BASE}/Tunel/ultimo_estado_dispositivos/`;
const SOURCE_STARCOOL =
  import.meta.env.VITE_STARCOOL_ULTIMO_ESTADO_URL ??
  `${TELEMETRY_STARCOOL_BASE}/Starcool/ultimo_estado_dispositivos/`;
/** API StarCool en :9051 — etiquetada STARCOOL2 (ver api_star.md). */
const SOURCE_STARCOOL2 =
  import.meta.env.VITE_STARCOOL2_ULTIMO_ESTADO_URL ??
  `${TELEMETRY_STARCOOL2_BASE}/Starcool/dispositivos/`;
const SOURCE_TERMOKING =
  import.meta.env.VITE_TERMOKING_ULTIMO_ESTADO_URL ??
  `${import.meta.env.VITE_TERMOKING_API_URL ?? TELEMETRY_TUNEL_TERMOKING_BASE}/TermoKing/ultimo_estado_dispositivos/`;

const SOURCES: { url: string; codigo: DispositivoOrigenCodigo }[] = [
  { url: SOURCE_TUNEL, codigo: 'TUNEL' },
  { url: SOURCE_STARCOOL, codigo: 'STARCOOL' },
  { url: SOURCE_STARCOOL2, codigo: 'STARCOOL2' },
  { url: SOURCE_TERMOKING, codigo: 'TERMOKING' },
];

function parseUltimoEstado(json: unknown): UltimoEstadoDispositivosResponse {
  const root = json as { data?: { dispositivos?: unknown } };
  if (root?.data == null) {
    throw new Error('Respuesta inválida: falta data');
  }
  if (!Array.isArray(root.data.dispositivos)) {
    throw new Error('Respuesta inválida: data.dispositivos debe ser un array');
  }
  return json as UltimoEstadoDispositivosResponse;
}

async function fetchUltimoEstadoFromUrl(
  url: string
): Promise<UltimoEstadoDispositivosResponse> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return parseUltimoEstado(await res.json());
}

/**
 * Último estado desde Túnel, Starcool, Starcool2 y Termo King.
 * STARCOOL + STARCOOL2 con el mismo IMEI se fusionan (fecha más reciente; empate → STARCOOL2).
 */
export async function fetchUltimoEstadoDispositivos(): Promise<UltimoEstadoDispositivosResponse> {
  const settled = await Promise.allSettled(
    SOURCES.map((s) => fetchUltimoEstadoFromUrl(s.url))
  );

  const ok: UltimoEstadoDispositivosResponse[] = [];
  const errors: string[] = [];

  settled.forEach((result, i) => {
    const label = SOURCES[i].codigo;
    if (result.status === 'fulfilled') {
      ok.push(result.value);
    } else {
      const reason = result.reason;
      errors.push(
        `${label}: ${reason instanceof Error ? reason.message : String(reason)}`
      );
    }
  });

  if (ok.length === 0) {
    throw new Error(
      errors.length > 0
        ? `No se pudo cargar ningún origen. ${errors.join(' | ')}`
        : 'No se pudo cargar ningún origen.'
    );
  }

  const labeled: UltimoEstadoDispositivosResponse['data']['dispositivos'] = [];
  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const codigo = SOURCES[i].codigo;
    for (const d of result.value.data.dispositivos) {
      labeled.push({ ...d, codigo });
    }
  });

  const dispositivos = mergeStarcoolOrigenes(labeled);
  const zona =
    ok.map((r) => r.data.resumen?.zona_horaria).find((z) => z != null && z !== '') ??
    'GMT-5';

  return {
    data: {
      // Recalcular tras dedupe STARCOOL/STARCOOL2 (evita contar el mismo IMEI dos veces).
      resumen: resumenFromDispositivos(dispositivos, zona),
      dispositivos,
    },
  };
}
