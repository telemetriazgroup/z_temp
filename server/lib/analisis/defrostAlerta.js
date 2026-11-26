import { fetchHistorialUltimasHoras, timestampRegistroHistorial } from '../historicalTelemetry.js';
import { findDefrostSegmentsInInterval, isLikelyDefrostPoint } from './defrostPattern.js';
import { evaporadorValido } from '../lecturasValidas.js';

/** Un defrost real no pasa de 2 horas. Más tiempo es falso defrost y cuenta como fuera de rango. */
export const MAX_DEFROST_ALERTA_MS = 2 * 60 * 60 * 1000;
const MIN_COLA_MS = 5 * 60 * 1000;

function puntos(datos) {
  return [...(datos ?? [])]
    .map((row) => {
      const ts = timestampRegistroHistorial(row);
      const supply = Number(row?.temp_supply_1);
      const ret = Number(row?.return_air);
      const evap = evaporadorValido(row?.evaporation_coil);
      if (!Number.isFinite(ts) || evap == null || !Number.isFinite(supply) || !Number.isFinite(ret)) {
        if (row?.en_defrost === true && Number.isFinite(ts)) {
          return { ts, supply: 0, ret: 0, evap: 0, enDefrost: true, soloBandera: true };
        }
        return null;
      }
      return { ts, supply, ret, evap, enDefrost: row?.en_defrost === true, soloBandera: false };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

function esDefrost(p) {
  if (p.soloBandera) return p.enDefrost === true;
  return isLikelyDefrostPoint(p);
}

function colaDefrost(datos, nowMs) {
  const pts = puntos(datos).filter((p) => p.ts <= nowMs);
  if (!pts.length || !esDefrost(pts[pts.length - 1])) return { ms: 0, desde: nowMs, hasta: nowMs };
  let i = pts.length - 1;
  while (i > 0 && esDefrost(pts[i - 1]) && pts[i].ts - pts[i - 1].ts <= 20 * 60 * 1000) i -= 1;
  return {
    ms: pts[pts.length - 1].ts - pts[i].ts,
    desde: pts[i].ts,
    hasta: pts[pts.length - 1].ts,
  };
}

/**
 * Separa el defrost (patrón térmico o bandera, máximo 2 h) del tiempo fuera de rango.
 * pausar: ahora mismo está en un defrost válido, no hay que alertar fuera de rango.
 * falso: la forma de defrost ya lleva más de 2 h, cuenta entero como fuera de rango.
 */
export function clasificarDefrostEnFilas(datos, sinceIso, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const sinceMs = new Date(sinceIso).getTime();
  const base = { pausar: false, falso: false, horasQuitar: 0, fueraDesde: sinceIso };
  if (!Number.isFinite(sinceMs) || !Number.isFinite(nowMs) || nowMs <= sinceMs) return base;

  const segments = findDefrostSegmentsInInterval(datos, sinceIso, new Date(nowMs).toISOString(), {
    maxMs: MAX_DEFROST_ALERTA_MS,
  });
  let msCerrados = 0;
  let ultimoUntil = sinceMs;
  for (const seg of segments) {
    const a = Math.max(sinceMs, new Date(seg.since).getTime());
    const b = Math.min(nowMs, new Date(seg.until).getTime());
    if (b > a) msCerrados += b - a;
    if (b > ultimoUntil) ultimoUntil = b;
  }

  const cola = colaDefrost(datos, nowMs);
  if (cola.ms > MAX_DEFROST_ALERTA_MS) {
    return { pausar: false, falso: true, horasQuitar: 0, fueraDesde: sinceIso };
  }
  const cubierta = segments.some((seg) => cola.desde >= new Date(seg.since).getTime() - 1000 && cola.hasta <= new Date(seg.until).getTime() + 1000);
  const extra = cola.ms >= MIN_COLA_MS && !cubierta ? cola.ms : 0;
  if (cola.ms >= MIN_COLA_MS && cola.ms <= MAX_DEFROST_ALERTA_MS) {
    return {
      pausar: true,
      falso: false,
      horasQuitar: (msCerrados + extra) / 3600000,
      fueraDesde: null,
    };
  }
  return {
    pausar: false,
    falso: false,
    horasQuitar: msCerrados / 3600000,
    fueraDesde: ultimoUntil > sinceMs ? new Date(ultimoUntil).toISOString() : sinceIso,
  };
}

const cache = new Map();

export async function ajusteDefrostAlerta(dispositivo, sinceIso, now = new Date()) {
  const vacio = { pausar: false, falso: false, horasQuitar: 0, fueraDesde: sinceIso || null };
  if (!dispositivo?.codigo || !dispositivo?.imei || !sinceIso) return vacio;
  const clave = `${dispositivo.codigo}|${dispositivo.imei}|${sinceIso}`;
  const previo = cache.get(clave);
  if (previo && Date.now() - previo.at < 60 * 1000) return previo.valor;
  let datos = [];
  try {
    const hist = await fetchHistorialUltimasHoras(dispositivo.codigo, dispositivo.imei, 12, now);
    datos = Array.isArray(hist?.datos) ? hist.datos : [];
  } catch {
    return vacio;
  }
  const valor = clasificarDefrostEnFilas(datos, sinceIso, now);
  cache.set(clave, { at: Date.now(), valor });
  if (cache.size > 400) cache.clear();
  return valor;
}
