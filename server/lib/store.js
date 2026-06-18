import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.CORREO_DATA_DIR ?? path.join(process.cwd(), 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name) {
  ensureDir();
  return path.join(DATA_DIR, name);
}

export function readJson(name, fallback) {
  try {
    const fp = filePath(name);
    if (!fs.existsSync(fp)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJson(name, data) {
  const fp = filePath(name);
  ensureDir();
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_UMBRALES = Array.from({ length: 23 }, (_, i) => i + 2);

export function normalizeUmbrales(list) {
  const src = Array.isArray(list) && list.length ? list : DEFAULT_UMBRALES;
  return [...new Set(src.filter((h) => h >= 2 && h <= 24))].sort((a, b) => a - b);
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function yesterdayKey(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return todayKey(x);
}
