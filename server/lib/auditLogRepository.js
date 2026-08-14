import { readJson, writeJson, uid } from './store.js';

const AUDIT_FILE = 'audit_log.json';
const MAX_ENTRIES = 8000;

function readLog() {
  const raw = readJson(AUDIT_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeLog(entries) {
  writeJson(AUDIT_FILE, entries.slice(0, MAX_ENTRIES));
}

function parseBound(value, endOfDay = false) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  // date-only YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * @param {{
 *   actorUsername: string,
 *   actorId?: string,
 *   action: string,
 *   module?: string,
 *   summary: string,
 *   targetUsername?: string,
 *   targetId?: string,
 *   detail?: Record<string, unknown>,
 * }} event
 */
export function appendAuditEvent(event) {
  const entries = readLog();
  const row = {
    id: uid('audit'),
    at: new Date().toISOString(),
    actorUsername: String(event.actorUsername ?? 'sistema'),
    actorId: event.actorId ? String(event.actorId) : undefined,
    action: String(event.action ?? 'unknown'),
    module: String(event.module ?? 'app'),
    summary: String(event.summary ?? ''),
    targetUsername: event.targetUsername
      ? String(event.targetUsername)
      : undefined,
    targetId: event.targetId ? String(event.targetId) : undefined,
    detail:
      event.detail && typeof event.detail === 'object' ? event.detail : undefined,
  };
  entries.unshift(row);
  writeLog(entries);
  return row;
}

export function listAuditEvents({
  limit = 100,
  offset = 0,
  actorUsername,
  action,
  module,
  from,
  to,
  q,
} = {}) {
  let entries = readLog();
  if (actorUsername) {
    const key = String(actorUsername).trim().toLowerCase();
    entries = entries.filter(
      (e) => String(e.actorUsername ?? '').toLowerCase() === key
    );
  }
  if (action) {
    entries = entries.filter((e) => e.action === action);
  }
  if (module) {
    entries = entries.filter((e) => e.module === module);
  }
  const fromMs = parseBound(from, false);
  const toMs = parseBound(to, true);
  if (fromMs != null) {
    entries = entries.filter((e) => {
      const t = new Date(e.at).getTime();
      return !Number.isNaN(t) && t >= fromMs;
    });
  }
  if (toMs != null) {
    entries = entries.filter((e) => {
      const t = new Date(e.at).getTime();
      return !Number.isNaN(t) && t <= toMs;
    });
  }
  if (q) {
    const needle = String(q).trim().toLowerCase();
    if (needle) {
      entries = entries.filter((e) => {
        const hay = [
          e.summary,
          e.action,
          e.module,
          e.actorUsername,
          e.targetUsername,
          e.targetId,
          JSON.stringify(e.detail ?? {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      });
    }
  }
  const total = entries.length;
  return {
    total,
    data: entries.slice(offset, offset + Math.min(500, Math.max(1, limit))),
  };
}

/** Acciones distintas presentes en el log (para filtros UI). */
export function listAuditActionCatalog({ limit = 80 } = {}) {
  const entries = readLog();
  const seen = new Map();
  for (const e of entries) {
    const a = e.action;
    if (!a) continue;
    if (!seen.has(a)) seen.set(a, e.module ?? 'app');
    if (seen.size >= limit) break;
  }
  return [...seen.entries()].map(([action, module]) => ({ action, module }));
}
