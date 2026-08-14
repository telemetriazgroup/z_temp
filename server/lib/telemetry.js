import { observeTelemetryFetch } from './dashboard/observeTelemetry.js';

const TUNEL_BASE = process.env.TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const STARCOOL_BASE = process.env.STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';
/** Misma API StarCool documentada en api_star.md (host :9051). */
const STARCOOL2_BASE = process.env.STARCOOL2_API_BASE ?? TUNEL_BASE;

const SOURCES = [
  { url: `${TUNEL_BASE}/Tunel/ultimo_estado_dispositivos/`, codigo: 'TUNEL' },
  { url: `${STARCOOL_BASE}/Starcool/ultimo_estado_dispositivos/`, codigo: 'STARCOOL' },
  { url: `${STARCOOL2_BASE}/Starcool/dispositivos/`, codigo: 'STARCOOL2' },
  { url: `${TUNEL_BASE}/TermoKing/ultimo_estado_dispositivos/`, codigo: 'TERMOKING' },
];

const STARCOOL_CODIGOS = new Set(['STARCOOL', 'STARCOOL2']);

function ultimaActualizacionMs(value) {
  if (value == null || value === '') return NaN;
  const s = String(value).trim();
  if (!s) return NaN;
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return new Date(s).getTime();
  // Naive en BD = GMT-5
  return new Date(`${s}-05:00`).getTime();
}

function preferirEntreStarcool(a, b) {
  const ta = ultimaActualizacionMs(a.ultima_actualizacion);
  const tb = ultimaActualizacionMs(b.ultima_actualizacion);
  const aOk = !Number.isNaN(ta);
  const bOk = !Number.isNaN(tb);

  if (aOk && bOk) {
    if (tb > ta) return b;
    if (ta > tb) return a;
  } else if (aOk) {
    return a;
  } else if (bOk) {
    return b;
  }

  if (a.codigo === 'STARCOOL2') return a;
  if (b.codigo === 'STARCOOL2') return b;
  return a;
}

function mergeStarcoolOrigenes(dispositivos) {
  const porImei = new Map();
  const resto = [];
  for (const d of dispositivos) {
    if (!STARCOOL_CODIGOS.has(d.codigo)) {
      resto.push(d);
      continue;
    }
    const prev = porImei.get(d.imei);
    if (prev == null) porImei.set(d.imei, d);
    else porImei.set(d.imei, preferirEntreStarcool(prev, d));
  }
  return [...resto, ...porImei.values()];
}

async function fetchSource(source) {
  const started = Date.now();
  try {
    const res = await fetch(source.url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.data?.dispositivos || !Array.isArray(json.data.dispositivos)) {
      throw new Error('Respuesta inválida');
    }
    const dispositivos = json.data.dispositivos.map((d) => ({
      ...d,
      codigo: source.codigo,
    }));
    return {
      codigo: source.codigo,
      url: source.url,
      ok: true,
      latencyMs: Date.now() - started,
      error: null,
      dispositivos,
    };
  } catch (e) {
    return {
      codigo: source.codigo,
      url: source.url,
      ok: false,
      latencyMs: Date.now() - started,
      error: e?.message ?? String(e),
      dispositivos: [],
    };
  }
}

/**
 * Consulta todos los orígenes y devuelve dispositivos + detalle por link.
 * Registra trazabilidad de links (últimas 3 h) y equipos nuevos.
 */
export async function fetchAllDispositivosDetailed() {
  const links = await Promise.all(SOURCES.map(fetchSource));
  const dispositivos = [];
  const errors = [];
  for (const link of links) {
    if (link.ok) dispositivos.push(...link.dispositivos);
    else errors.push(`${link.codigo}: ${link.error}`);
  }
  const merged = mergeStarcoolOrigenes(dispositivos);
  await observeTelemetryFetch(links, merged);
  return {
    dispositivos: merged,
    links: links.map(({ dispositivos: devices, ...rest }) => ({
      ...rest,
      deviceCount: devices?.length ?? 0,
    })),
    errors,
  };
}

export async function fetchAllDispositivos() {
  const { dispositivos, errors } = await fetchAllDispositivosDetailed();
  if (dispositivos.length === 0) {
    throw new Error(errors.join(' | ') || 'Sin telemetría');
  }
  return dispositivos;
}

export function deviceRowKey(d) {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

export function listTelemetrySources() {
  return SOURCES.map((s) => ({ codigo: s.codigo, url: s.url }));
}
