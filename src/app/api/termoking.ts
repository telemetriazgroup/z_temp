import type {
  DispositivoOrigenCodigo,
  UltimoEstadoDispositivosResponse,
  ResumenDispositivos,
} from '../types';
import {
  TELEMETRY_STARCOOL_BASE,
  TELEMETRY_TUNEL_TERMOKING_BASE,
} from './telemetryBases';

const SOURCE_TUNEL =
  import.meta.env.VITE_TUNEL_ULTIMO_ESTADO_URL ??
  `${TELEMETRY_TUNEL_TERMOKING_BASE}/Tunel/ultimo_estado_dispositivos/`;
const SOURCE_STARCOOL =
  import.meta.env.VITE_STARCOOL_ULTIMO_ESTADO_URL ??
  `${TELEMETRY_STARCOOL_BASE}/Starcool/ultimo_estado_dispositivos/`;
const SOURCE_TERMOKING =
  import.meta.env.VITE_TERMOKING_ULTIMO_ESTADO_URL ??
  `${import.meta.env.VITE_TERMOKING_API_URL ?? TELEMETRY_TUNEL_TERMOKING_BASE}/TermoKing/ultimo_estado_dispositivos/`;

const SOURCES: { url: string; codigo: DispositivoOrigenCodigo }[] = [
  { url: SOURCE_TUNEL, codigo: 'TUNEL' },
  { url: SOURCE_STARCOOL, codigo: 'STARCOOL' },
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

async function fetchUltimoEstadoFromUrl(url: string): Promise<UltimoEstadoDispositivosResponse> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return parseUltimoEstado(await res.json());
}

function mergeResumenes(partes: ResumenDispositivos[]): ResumenDispositivos {
  const base = partes[0];
  return partes.slice(1).reduce(
    (acc, r) => ({
      total_dispositivos: acc.total_dispositivos + r.total_dispositivos,
      online: acc.online + r.online,
      wait: acc.wait + r.wait,
      offline: acc.offline + r.offline,
      en_defrost: acc.en_defrost + r.en_defrost,
      power_on: acc.power_on + r.power_on,
      power_off: acc.power_off + r.power_off,
      zona_horaria: acc.zona_horaria || r.zona_horaria,
    }),
    { ...base }
  );
}

/**
 * Último estado de dispositivos desde Túnel, Starcool y Termo King.
 * Cada ítem incluye `codigo`: TUNEL | STARCOOL | TERMOKING.
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

  const resumenes = ok.map((r) => r.data.resumen);

  return {
    data: {
      resumen: mergeResumenes(resumenes),
      dispositivos: labeled,
    },
  };
}
