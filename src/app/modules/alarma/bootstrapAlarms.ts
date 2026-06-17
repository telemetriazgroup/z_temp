import type { AlarmCatalogEntry, AlarmCatalogSeedFile } from './types';
import seedFile from './data/mp4000Alarms.json';

const SEED = seedFile as AlarmCatalogSeedFile;

export function catalogIdFor(model: string, code: number): string {
  return `alarm-${model}-${code}`;
}

export function seedEntryToCatalog(
  entry: Omit<AlarmCatalogEntry, 'id'>,
  modelOverride?: string
): AlarmCatalogEntry {
  const model = modelOverride ?? entry.model;
  return {
    ...entry,
    model,
    id: catalogIdFor(model, entry.code),
  };
}

/** Catálogo semilla MP4000 desde `alarmas_tk_mp4000_2026-06-17.json`. */
export function buildBootstrapAlarmCatalog(): AlarmCatalogEntry[] {
  const model = SEED.meta?.model ?? 'MP4000';
  return SEED.alarms.map((a) => seedEntryToCatalog(a, model));
}
