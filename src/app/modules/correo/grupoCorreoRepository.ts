import type { GrupoCorreo } from './types';

const STORAGE_KEY = 'ztrack_grupos_correo_v1';

function readAll(): GrupoCorreo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as GrupoCorreo[];
  } catch {
    return [];
  }
}

function writeAll(groups: GrupoCorreo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function generateGrupoCorreoId(): string {
  return `grupo-correo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getGruposCorreo(): GrupoCorreo[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getGrupoCorreoById(id: string): GrupoCorreo | null {
  return readAll().find((g) => g.id === id) ?? null;
}

export function getGruposCorreoForDevice(rowKey: string): GrupoCorreo[] {
  return readAll().filter(
    (g) => g.enabled && g.devices.some((d) => d.rowKey === rowKey && d.enabled)
  );
}

export function upsertGrupoCorreo(
  input: Omit<GrupoCorreo, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): GrupoCorreo {
  const now = new Date().toISOString();
  const all = readAll();
  const idx = all.findIndex((g) => g.id === input.id);
  const entry: GrupoCorreo = {
    ...input,
    emails: input.emails.map((e) => e.trim()).filter(Boolean),
    createdAt: input.createdAt ?? (idx >= 0 ? all[idx].createdAt : now),
    updatedAt: now,
  };
  if (idx === -1) {
    writeAll([...all, entry]);
  } else {
    all[idx] = entry;
    writeAll(all);
  }
  return entry;
}

export function deleteGrupoCorreo(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id));
}

export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export function normalizeUmbrales(umbrales?: number[]): number[] {
  const src = umbrales?.length ? umbrales : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  return [...new Set(src.filter((h) => h >= 2 && h <= 24))].sort((a, b) => a - b);
}
