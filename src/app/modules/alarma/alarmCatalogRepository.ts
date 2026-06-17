import type { AlarmCatalogEntry } from './types';
import { buildBootstrapAlarmCatalog, catalogIdFor } from './bootstrapAlarms';

const STORAGE_KEY = 'ztrack_alarm_catalog_v1';

function readRaw(): AlarmCatalogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AlarmCatalogEntry[];
  } catch {
    return [];
  }
}

function writeRaw(entries: AlarmCatalogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function catalogKey(entry: Pick<AlarmCatalogEntry, 'model' | 'code'>): string {
  return `${entry.model}::${entry.code}`;
}

/** Carga el catálogo semilla si está vacío; fusiona entradas nuevas del seed sin sobrescribir edits. */
export function ensureAlarmCatalog(): AlarmCatalogEntry[] {
  let entries = readRaw();
  if (entries.length === 0) {
    entries = buildBootstrapAlarmCatalog();
    writeRaw(entries);
    return entries;
  }

  const byKey = new Set(entries.map((e) => catalogKey(e)));
  let changed = false;
  for (const seed of buildBootstrapAlarmCatalog()) {
    const key = catalogKey(seed);
    if (!byKey.has(key)) {
      entries.push({ ...seed });
      byKey.add(key);
      changed = true;
    }
  }
  if (changed) writeRaw(entries);
  return entries;
}

export function getAlarmCatalogEntries(options?: {
  model?: string;
  includeArchived?: boolean;
}): AlarmCatalogEntry[] {
  ensureAlarmCatalog();
  let list = readRaw();
  if (options?.model) {
    list = list.filter((e) => e.model === options.model);
  }
  if (options?.includeArchived !== true) {
    list = list.filter((e) => !e.archived);
  }
  return list.sort((a, b) => a.code - b.code);
}

export function getAlarmCatalogById(id: string): AlarmCatalogEntry | undefined {
  return readRaw().find((e) => e.id === id);
}

export function getAlarmCatalogByCode(
  code: number,
  model = 'MP4000'
): AlarmCatalogEntry | undefined {
  return readRaw().find((e) => e.model === model && e.code === code);
}

export function addAlarmCatalogEntry(
  entry: Omit<AlarmCatalogEntry, 'id'>
): AlarmCatalogEntry {
  ensureAlarmCatalog();
  const entries = readRaw();
  if (entries.some((e) => e.model === entry.model && e.code === entry.code)) {
    throw new Error(`Ya existe una alarma con código ${entry.code} para ${entry.model}`);
  }
  const created: AlarmCatalogEntry = {
    ...entry,
    id: catalogIdFor(entry.model, entry.code),
  };
  entries.push(created);
  writeRaw(entries);
  return created;
}

export function updateAlarmCatalogEntry(
  id: string,
  patch: Partial<Omit<AlarmCatalogEntry, 'id'>>
): AlarmCatalogEntry {
  const entries = readRaw();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Alarma del catálogo no encontrada');

  const prev = entries[idx];
  const nextModel = patch.model ?? prev.model;
  const nextCode = patch.code ?? prev.code;

  if (
    (patch.model != null || patch.code != null) &&
    entries.some(
      (e, i) =>
        i !== idx && e.model === nextModel && e.code === nextCode
    )
  ) {
    throw new Error(`Ya existe una alarma con código ${nextCode} para ${nextModel}`);
  }

  const next: AlarmCatalogEntry = {
    ...prev,
    ...patch,
    id: catalogIdFor(nextModel, nextCode),
  };
  entries[idx] = next;
  writeRaw(entries);
  return next;
}

export function deleteAlarmCatalogEntry(id: string): void {
  writeRaw(readRaw().filter((e) => e.id !== id));
}
