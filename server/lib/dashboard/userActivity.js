import { query } from '../db.js';
import { listAuditEvents } from '../auditLogRepository.js';

export async function recordUserLogin(user) {
  if (!user?.username) return;
  await query(
    `INSERT INTO dashboard_user_login (user_id, username, role, super_user, logged_in_at)
     VALUES ($1,$2,$3,$4,now())`,
    [
      user.id ?? null,
      String(user.username),
      user.role ?? null,
      user.superUser === true,
    ]
  );
  await query(
    `DELETE FROM dashboard_user_login
     WHERE logged_in_at < now() - interval '30 days'`
  );
}

/** Último login por usuario distinto (sin repetir el mismo username). */
export async function listRecentLogins({ limit = 8 } = {}) {
  const lim = Math.min(20, Math.max(1, limit));
  const r = await query(
    `WITH latest AS (
       SELECT DISTINCT ON (lower(username))
         id, user_id, username, role, super_user, logged_in_at
       FROM dashboard_user_login
       ORDER BY lower(username), logged_in_at DESC
     ),
     counts AS (
       SELECT lower(username) AS uname, COUNT(*)::int AS login_count
       FROM dashboard_user_login
       WHERE logged_in_at >= now() - interval '30 days'
       GROUP BY lower(username)
     )
     SELECT l.id, l.user_id, l.username, l.role, l.super_user, l.logged_in_at,
            COALESCE(c.login_count, 1) AS login_count
     FROM latest l
     LEFT JOIN counts c ON c.uname = lower(l.username)
     ORDER BY l.logged_in_at DESC
     LIMIT $1`,
    [lim]
  );

  return r.rows.map((row) => ({
    id: String(row.id),
    userId: row.user_id,
    username: row.username,
    role: row.role,
    superUser: row.super_user === true,
    logged_in_at: row.logged_in_at,
    loginCount: Number(row.login_count) || 1,
  }));
}

export async function listLoginsForUsername(username, { limit = 50 } = {}) {
  const key = String(username ?? '').trim();
  if (!key) return [];
  const r = await query(
    `SELECT id, user_id, username, role, super_user, logged_in_at
     FROM dashboard_user_login
     WHERE lower(username) = lower($1)
     ORDER BY logged_in_at DESC
     LIMIT $2`,
    [key, Math.min(100, Math.max(1, limit))]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    userId: row.user_id,
    username: row.username,
    role: row.role,
    superUser: row.super_user === true,
    logged_in_at: row.logged_in_at,
  }));
}

/**
 * Historial de conexiones + acciones (auditoría) de un usuario.
 */
export async function getUserConnectionDetail(username, { limit = 80 } = {}) {
  const key = String(username ?? '').trim();
  if (!key) {
    return { username: '', logins: [], actions: [], timeline: [] };
  }

  const [logins, audit] = await Promise.all([
    listLoginsForUsername(key, { limit }),
    Promise.resolve(
      listAuditEvents({
        actorUsername: key,
        limit: Math.min(200, Math.max(1, limit)),
      })
    ),
  ]);

  const timeline = [];

  for (const login of logins) {
    timeline.push({
      id: `login-${login.id}`,
      at: login.logged_in_at,
      kind: 'login',
      action: 'login',
      module: 'auth',
      summary: 'Inicio de sesión',
      detail: {
        role: login.role,
        superUser: login.superUser,
      },
    });
  }

  for (const ev of audit.data) {
    // Evitar duplicar el login si ya está en dashboard_user_login
    if (ev.action === 'login') continue;
    timeline.push({
      id: ev.id,
      at: ev.at,
      kind: 'action',
      action: ev.action,
      module: ev.module,
      summary: ev.summary,
      detail: ev.detail,
      targetId: ev.targetId,
      targetUsername: ev.targetUsername,
    });
  }

  timeline.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    username: key,
    role: logins[0]?.role ?? null,
    superUser: logins[0]?.superUser === true,
    loginCount: logins.length,
    logins,
    actions: audit.data,
    timeline: timeline.slice(0, Math.min(200, Math.max(1, limit))),
  };
}
