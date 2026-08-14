import { query } from '../db.js';

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

export async function listRecentLogins({ limit = 12 } = {}) {
  const r = await query(
    `SELECT id, user_id, username, role, super_user, logged_in_at
     FROM dashboard_user_login
     ORDER BY logged_in_at DESC
     LIMIT $1`,
    [limit]
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
