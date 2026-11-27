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

export function ultimaActualizacionMs(value) {
  if (value == null || value === '') return NaN;
  const s = String(value).trim();
  if (!s) return NaN;
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return new Date(s).getTime();
  // Naive en BD = GMT-5
  return new Date(`${s}-05:00`).getTime();
}

export function preferirEntreStarcool(a, b) {
  const aVivo = a.ausente_api !== true && a.estado_conexion !== 'historial';
  const bVivo = b.ausente_api !== true && b.estado_conexion !== 'historial';
  if (aVivo !== bVivo) return aVivo ? a : b;

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

export function mergeStarcoolOrigenes(dispositivos) {
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

/** Cuántos IMEI comparten señal y cuál de las dos queda en pantalla. */
export function resumenSenalesStarcool(dispositivos) {
  const porImei = new Map();
  const tunel = new Set();
  const termo = new Set();
  let soloStarcool = 0;
  let soloStarcool2 = 0;
  for (const d of dispositivos || []) {
    const imei = String(d?.imei || '');
    if (!imei) continue;
    if (d.codigo === 'TUNEL') tunel.add(imei);
    else if (d.codigo === 'TERMOKING' || d.codigo === 'THERMOKING') termo.add(imei);
    else if (STARCOOL_CODIGOS.has(d.codigo)) {
      if (!porImei.has(imei)) porImei.set(imei, []);
      porImei.get(imei).push(d);
    }
  }
  let enAmbas = 0;
  let muestraStarcool = 0;
  let muestraStarcool2 = 0;
  let masRecienteStarcool = 0;
  let masRecienteStarcool2 = 0;
  let empate = 0;
  let sinFecha = 0;
  let tambienTunel = 0;
  let tambienThermoking = 0;
  for (const [imei, lista] of porImei) {
    const tiene1 = lista.some((d) => d.codigo === 'STARCOOL');
    const tiene2 = lista.some((d) => d.codigo === 'STARCOOL2');
    if (tiene1 && !tiene2) soloStarcool += 1;
    if (tiene2 && !tiene1) soloStarcool2 += 1;
    if (!tiene1 || !tiene2) continue;
    enAmbas += 1;
    const a = lista.find((d) => d.codigo === 'STARCOOL');
    const b = lista.find((d) => d.codigo === 'STARCOOL2');
    const ta = ultimaActualizacionMs(a.ultima_actualizacion);
    const tb = ultimaActualizacionMs(b.ultima_actualizacion);
    if (Number.isNaN(ta) && Number.isNaN(tb)) sinFecha += 1;
    else if (!Number.isNaN(tb) && (Number.isNaN(ta) || tb > ta)) masRecienteStarcool2 += 1;
    else if (!Number.isNaN(ta) && (Number.isNaN(tb) || ta > tb)) masRecienteStarcool += 1;
    else empate += 1;
    const visible = preferirEntreStarcool(a, b).codigo;
    if (visible === 'STARCOOL') muestraStarcool += 1;
    else muestraStarcool2 += 1;
    if (tunel.has(imei)) tambienTunel += 1;
    if (termo.has(imei)) tambienThermoking += 1;
  }
  return {
    enAmbas,
    soloStarcool,
    soloStarcool2,
    masRecienteStarcool,
    masRecienteStarcool2,
    empate,
    sinFecha,
    muestraStarcool,
    muestraStarcool2,
    tambienTunel,
    tambienThermoking,
  };
}

async function fetchSource(source, { timeoutMs = 50_000 } = {}) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(source.url, { method: 'GET', signal: ctrl.signal });
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
    const aborted = e?.name === 'AbortError';
    return {
      codigo: source.codigo,
      url: source.url,
      ok: false,
      latencyMs: Date.now() - started,
      error: aborted ? `timeout ${timeoutMs}ms` : (e?.message ?? String(e)),
      dispositivos: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta los orígenes en paralelo. Cada link falla solo: un timeout
 * no descarta lo que los demás ya respondieron.
 * No escribe en base; eso lo hace la sincronización programada.
 */
export async function fetchSourcesDetailed({ timeoutMs = 50_000 } = {}) {
  const links = await Promise.all(SOURCES.map((source) => fetchSource(source, { timeoutMs })));
  const dispositivos = [];
  const errors = [];
  for (const link of links) {
    if (link.ok) dispositivos.push(...link.dispositivos);
    else errors.push(`${link.codigo}: ${link.error}`);
  }
  return {
    dispositivos: mergeStarcoolOrigenes(dispositivos),
    links,
    errors,
  };
}

export async function fetchAllDispositivos() {
  const { dispositivos, errors } = await fetchSourcesDetailed();
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
