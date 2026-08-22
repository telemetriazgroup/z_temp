import type { HistorialVistaPrefs } from './types';
import { defaultHistorialVistaPrefs, prefsFromPreset } from './presets';
import { getHistorialFieldDef } from './catalog';

const LS_PREFIX = 'ztrack_historial_vista_v1:';
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function storageKey(username: string, imei: string): string {
  return `${LS_PREFIX}${username.trim().toLowerCase()}:${String(imei).trim()}`;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!HEX_COLOR.test(s)) return null;
  if (s.length === 4) {
    const [, r, g, b] = s;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return s.toLowerCase();
}

export function parseChartColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!getHistorialFieldDef(key)?.chartable) continue;
    const hex = normalizeHexColor(value);
    if (hex) out[key] = hex;
  }
  return out;
}

export function parseLabelKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(String)
    .filter((k) => getHistorialFieldDef(k)?.chartable);
}

export function normalizeVistaPrefs(raw: unknown): HistorialVistaPrefs {
  const base = defaultHistorialVistaPrefs();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const preset =
    o.preset === 'REEFER' ||
    o.preset === 'TUNEL' ||
    o.preset === 'MADURADOR' ||
    o.preset === 'CUSTOM'
      ? o.preset
      : 'REEFER';

  const chartColors = parseChartColors(o.chartColors);
  const updatedAt =
    typeof o.updatedAt === 'string' ? o.updatedAt : undefined;

  if (preset !== 'CUSTOM') {
    return {
      ...prefsFromPreset(preset),
      chartColors: Object.keys(chartColors).length ? chartColors : undefined,
      updatedAt,
    };
  }

  const chartKeys = Array.isArray(o.chartKeys)
    ? o.chartKeys.map(String).filter((k) => getHistorialFieldDef(k)?.chartable)
    : base.chartKeys;
  const tableKeys = Array.isArray(o.tableKeys)
    ? o.tableKeys.map(String).filter((k) => getHistorialFieldDef(k)?.tableable)
    : base.tableKeys;
  const labelKeys = parseLabelKeys(o.labelKeys);

  return {
    preset: 'CUSTOM',
    chartKeys: chartKeys.length ? chartKeys : base.chartKeys,
    tableKeys: tableKeys.length ? tableKeys : base.tableKeys,
    labelKeys,
    chartColors: Object.keys(chartColors).length ? chartColors : undefined,
    updatedAt,
  };
}

export function readVistaPrefsLocal(
  username: string,
  imei: string
): HistorialVistaPrefs | null {
  try {
    const raw = localStorage.getItem(storageKey(username, imei));
    if (!raw) return null;
    return normalizeVistaPrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeVistaPrefsLocal(
  username: string,
  imei: string,
  prefs: HistorialVistaPrefs
): void {
  try {
    localStorage.setItem(
      storageKey(username, imei),
      JSON.stringify({ ...prefs, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore quota */
  }
}
