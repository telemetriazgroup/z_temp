import { readJson, writeJson, uid } from './store.js';

const AUDIT_FILE = 'audit_log.json';
const MAX_ENTRIES = 5000;

function readLog() {
  const raw = readJson(AUDIT_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeLog(entries) {
  writeJson(AUDIT_FILE, entries.slice(0, MAX_ENTRIES));
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
    module: String(event.module ?? 'usuarios'),
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
  const total = entries.length;
  return {
    total,
    data: entries.slice(offset, offset + limit),
  };
}
