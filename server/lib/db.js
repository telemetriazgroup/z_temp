import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  DATABASE_URL = process.env.POSTGRES_URL ??
    'postgresql://ztrack:ztrack@127.0.0.1:5434/ztrack_analisis',
} = process.env;

let pool = null;
let migrated = false;
/** @type {Promise<boolean> | null} */
let analisisMigrating = null;
let dashboardMigrated = false;
/** @type {Promise<boolean> | null} */
let dashboardMigrating = null;

export function isDbConfigured() {
  return Boolean(DATABASE_URL?.trim());
}

export function getPool() {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL no configurada');
  }
  if (pool == null) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function runAnalisisMigration() {
  if (migrated) return true;
  if (!isDbConfigured()) return false;
  const sqlPath = path.join(__dirname, '../sql/001_analisis.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await query(sql);
  // Migración: clasificaciones del motor (defrost + falsos positivos).
  await query(`
    DO $$
    BEGIN
      ALTER TABLE analisis_evento DROP CONSTRAINT IF EXISTS analisis_evento_clasificacion_check;
      ALTER TABLE analisis_evento
        ADD CONSTRAINT analisis_evento_clasificacion_check
        CHECK (clasificacion IN (
          'autorizado', 'programado', 'no_previsto', 'sin_clasificar', 'defrost',
          'falso_apagado', 'falso_fuera'
        ));
    EXCEPTION WHEN others THEN
      NULL;
    END $$;
  `);
  await query(`
    ALTER TABLE analisis_semana
      ADD COLUMN IF NOT EXISTS horas_defrost DOUBLE PRECISION NOT NULL DEFAULT 0
  `);
  await query(`
    ALTER TABLE analisis_semana
      ADD COLUMN IF NOT EXISTS eventos_defrost INT NOT NULL DEFAULT 0
  `);
  await query(`
    ALTER TABLE analisis_evento
      ADD COLUMN IF NOT EXISTS analisis TEXT
  `);
  await ensureDashboardSchema();
  migrated = true;
  console.log('[analisis] esquema PostgreSQL listo');
  return true;
}

export async function ensureAnalisisSchema() {
  if (migrated) return true;
  if (!isDbConfigured()) return false;
  if (analisisMigrating) return analisisMigrating;
  analisisMigrating = runAnalisisMigration()
    .catch((e) => {
      console.error('[analisis] no se pudo migrar esquema:', e.message);
      throw e;
    })
    .finally(() => {
      analisisMigrating = null;
    });
  return analisisMigrating;
}

async function runDashboardMigration() {
  if (dashboardMigrated) return true;
  if (!isDbConfigured()) return false;
  const sqlPath = path.join(__dirname, '../sql/002_dashboard.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await query(sql);
  dashboardMigrated = true;
  console.log('[dashboard] esquema PostgreSQL listo');
  return true;
}

export async function ensureDashboardSchema() {
  if (dashboardMigrated) return true;
  if (!isDbConfigured()) return false;
  if (dashboardMigrating) return dashboardMigrating;
  dashboardMigrating = runDashboardMigration()
    .catch((e) => {
      // CREATE TABLE IF NOT EXISTS no es atómico entre sesiones: si otra
      // conexión ya creó el tipo/tabla, reintentar es seguro.
      const msg = String(e?.message ?? e);
      if (
        msg.includes('pg_type_typname_nsp_index') ||
        msg.includes('already exists')
      ) {
        dashboardMigrated = true;
        console.log('[dashboard] esquema ya existente (carrera inofensiva)');
        return true;
      }
      console.error('[dashboard] no se pudo migrar esquema:', e.message);
      throw e;
    })
    .finally(() => {
      dashboardMigrating = null;
    });
  return dashboardMigrating;
}

export async function checkDbHealth() {
  if (!isDbConfigured()) {
    return { ok: false, error: 'DATABASE_URL no configurada' };
  }
  try {
    await query('SELECT 1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
