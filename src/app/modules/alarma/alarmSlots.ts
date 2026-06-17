import type { UltimoDatoDispositivo } from '../../types';
import type { AlarmCatalogEntry } from './types';
import { ensureAlarmCatalog, getAlarmCatalogByCode } from './alarmCatalogRepository';
import { isActiveAlarmCode } from './deviceAlarmRepository';
import { resolveAlarmTitle } from './alarmResolver';

/** Campos de alarma conocidos en telemetría túnel / Termo King. */
export const ALARMA_SLOT_FIELD_NAMES = [
  'numero_alarma',
  ...Array.from({ length: 12 }, (_, i) => `alarma_${String(i + 1).padStart(2, '0')}`),
] as const;

export type AlarmaSlotFieldName = (typeof ALARMA_SLOT_FIELD_NAMES)[number];

export interface AlarmaSlotLectura {
  slot: string;
  code: number;
}

export interface AlarmaSlotResuelta extends AlarmaSlotLectura {
  catalog: AlarmCatalogEntry | null;
  titleEs: string;
  enCatalogo: boolean;
}

function valorNumerico(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isNaN(n) ? null : n;
}

/** Extrae códigos de alarma válidos (>0, numéricos) desde `ultimo_dato`. */
export function extractActiveAlarmCodes(
  ultimoDato: UltimoDatoDispositivo | null | undefined
): AlarmaSlotLectura[] {
  if (ultimoDato == null) return [];

  const raw = ultimoDato as Record<string, unknown>;
  const out: AlarmaSlotLectura[] = [];
  const seen = new Set<string>();

  const push = (slot: string, val: unknown) => {
    const n = valorNumerico(val);
    if (!isActiveAlarmCode(n)) return;
    const dedupe = `${slot}::${n}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push({ slot, code: n });
  };

  for (const key of ALARMA_SLOT_FIELD_NAMES) {
    if (key in raw) push(key, raw[key]);
  }

  for (const key of Object.keys(raw)) {
    if (/^alarma_\d+$/i.test(key) && !ALARMA_SLOT_FIELD_NAMES.includes(key as AlarmaSlotFieldName)) {
      push(key, raw[key]);
    }
  }

  return out;
}

export function dispositivoTieneAlarmasActivas(
  ultimoDato: UltimoDatoDispositivo | null | undefined
): boolean {
  return extractActiveAlarmCodes(ultimoDato).length > 0;
}

/** Relaciona cada slot/código con el catálogo MP4000. */
export function resolveAlarmSlotsFromUltimoDato(
  ultimoDato: UltimoDatoDispositivo | null | undefined,
  model = 'MP4000'
): AlarmaSlotResuelta[] {
  ensureAlarmCatalog();
  return extractActiveAlarmCodes(ultimoDato).map(({ slot, code }) => {
    const catalog = getAlarmCatalogByCode(code, model);
    return {
      slot,
      code,
      catalog,
      titleEs: resolveAlarmTitle(catalog?.id ?? null, code, model),
      enCatalogo: catalog != null,
    };
  });
}

export function resolveAlarmSlotsFromDevice(
  dispositivo: { ultimo_dato: UltimoDatoDispositivo },
  model = 'MP4000'
): AlarmaSlotResuelta[] {
  return resolveAlarmSlotsFromUltimoDato(dispositivo.ultimo_dato, model);
}
