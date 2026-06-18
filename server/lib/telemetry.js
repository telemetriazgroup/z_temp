const TUNEL_BASE = process.env.TUNEL_API_BASE ?? 'http://161.132.53.51:9051';
const STARCOOL_BASE = process.env.STARCOOL_API_BASE ?? 'http://161.132.206.104:9112';

const SOURCES = [
  { url: `${TUNEL_BASE}/Tunel/ultimo_estado_dispositivos/`, codigo: 'TUNEL' },
  { url: `${STARCOOL_BASE}/Starcool/ultimo_estado_dispositivos/`, codigo: 'STARCOOL' },
  { url: `${TUNEL_BASE}/TermoKing/ultimo_estado_dispositivos/`, codigo: 'TERMOKING' },
];

async function fetchSource(source) {
  const res = await fetch(source.url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.data?.dispositivos || !Array.isArray(json.data.dispositivos)) {
    throw new Error('Respuesta inválida');
  }
  return json.data.dispositivos.map((d) => ({ ...d, codigo: source.codigo }));
}

export async function fetchAllDispositivos() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const dispositivos = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') dispositivos.push(...r.value);
    else errors.push(`${SOURCES[i].codigo}: ${r.reason?.message ?? r.reason}`);
  });
  if (dispositivos.length === 0) {
    throw new Error(errors.join(' | ') || 'Sin telemetría');
  }
  return dispositivos;
}

export function deviceRowKey(d) {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}
