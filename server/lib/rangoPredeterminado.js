import { readJson, writeJson } from './store.js';

const FILE = 'rangoPredeterminado.json';

/** Setpoint de -6 o más frío: ±4. Hasta antes de 16: ±6. Hasta antes de 21: ±8. Desde 21: ±10. */
export const RANGO_PREDETERMINADO_DEFAULT = {
  frioHasta: -6,
  frioMargen: 4,
  medioHasta: 16,
  medioMargen: 6,
  templadoHasta: 21,
  templadoMargen: 8,
  calidoMargen: 10,
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function margen(value, fallback) {
  const n = num(value, fallback);
  return Math.round(Math.min(30, Math.max(0, n)) * 10) / 10;
}

export function normalizarRangoPredeterminado(raw) {
  const d = RANGO_PREDETERMINADO_DEFAULT;
  const cfg = {
    frioHasta: num(raw?.frioHasta, d.frioHasta),
    frioMargen: margen(raw?.frioMargen, d.frioMargen),
    medioHasta: num(raw?.medioHasta, d.medioHasta),
    medioMargen: margen(raw?.medioMargen, d.medioMargen),
    templadoHasta: num(raw?.templadoHasta, d.templadoHasta),
    templadoMargen: margen(raw?.templadoMargen, d.templadoMargen),
    calidoMargen: margen(raw?.calidoMargen, d.calidoMargen),
  };
  if (!(cfg.frioHasta < cfg.medioHasta && cfg.medioHasta < cfg.templadoHasta)) {
    throw new Error('Los cortes deben ir en orden: el más frío, luego el medio y luego el templado');
  }
  return cfg;
}

export function getRangoPredeterminado() {
  try {
    return normalizarRangoPredeterminado(readJson(FILE, RANGO_PREDETERMINADO_DEFAULT));
  } catch {
    return { ...RANGO_PREDETERMINADO_DEFAULT };
  }
}

export function saveRangoPredeterminado(raw) {
  const cfg = normalizarRangoPredeterminado(raw);
  writeJson(FILE, { ...cfg, updatedAt: new Date().toISOString() });
  return cfg;
}

/** Margen °C predefinido para un setpoint. Sin setpoint, el de frío. */
export function margenPredeterminado(setPoint, cfg = getRangoPredeterminado()) {
  const sp = Number(setPoint);
  if (!Number.isFinite(sp) || sp <= cfg.frioHasta) return cfg.frioMargen;
  if (sp < cfg.medioHasta) return cfg.medioMargen;
  if (sp < cfg.templadoHasta) return cfg.templadoMargen;
  return cfg.calidoMargen;
}
