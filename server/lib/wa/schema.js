import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDbConfigured, query } from '../db.js';

const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sql/004_whatsapp.sql');

let ready = null;

export function ensureWaSchema() {
  if (!isDbConfigured()) return Promise.resolve(false);
  if (!ready) {
    ready = (async () => {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const parts = sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s.replace(/--[^\n]*/g, '').trim());
      for (const part of parts) {
        await query(part.endsWith(';') ? part : `${part};`);
      }
      return true;
    })();
  }
  return ready;
}
