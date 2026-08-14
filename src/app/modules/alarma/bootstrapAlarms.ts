import type { AlarmCatalogEntry, AlarmCatalogSeedFile } from './types';
import seedFile from './data/mp4000Alarms.json';

const SEED = seedFile as AlarmCatalogSeedFile;

export function catalogIdFor(model: string, code: number): string {
  return `alarm-${model}-${code}`;
}

/** Normaliza entradas antiguas / seed sin `mensajeUsuario`. */
export function normalizeAlarmCatalogEntry(
  entry: Omit<AlarmCatalogEntry, 'id'> & { id?: string; mensajeUsuario?: string }
): Omit<AlarmCatalogEntry, 'id'> & { id?: string } {
  const titleEs = String(entry.titleEs ?? '').trim();
  const mensaje =
    entry.mensajeUsuario != null && String(entry.mensajeUsuario).trim()
      ? String(entry.mensajeUsuario).trim()
      : titleEs;
  return {
    ...entry,
    titleEs,
    titleEn: String(entry.titleEn ?? ''),
    descriptionEs: String(entry.descriptionEs ?? ''),
    descriptionEn: String(entry.descriptionEn ?? ''),
    correctiveActionEs: String(entry.correctiveActionEs ?? ''),
    correctiveActionEn: String(entry.correctiveActionEn ?? ''),
    mensajeUsuario: mensaje,
    model: String(entry.model ?? 'MP4000'),
    archived: Boolean(entry.archived),
  };
}

export function seedEntryToCatalog(
  entry: Omit<AlarmCatalogEntry, 'id'> | (Omit<AlarmCatalogEntry, 'id' | 'mensajeUsuario'> & { mensajeUsuario?: string }),
  modelOverride?: string
): AlarmCatalogEntry {
  const normalized = normalizeAlarmCatalogEntry(entry);
  const model = modelOverride ?? normalized.model;
  return {
    ...normalized,
    model,
    id: catalogIdFor(model, normalized.code),
  } as AlarmCatalogEntry;
}

/** Catálogo semilla MP4000 desde `alarmas_tk_mp4000_2026-06-17.json`. */
export function buildBootstrapAlarmCatalog(): AlarmCatalogEntry[] {
  const model = SEED.meta?.model ?? 'MP4000';
  return SEED.alarms.map((a) => seedEntryToCatalog(a, model));
}
