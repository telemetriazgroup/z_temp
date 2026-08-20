/**
 * Fechas de acceso a datos por IMEI (server).
 */

export function normalizeAccessDate(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function todayAccessDate() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDeviceAccessFrom(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const imei = String(k ?? '').trim();
    const day = normalizeAccessDate(v);
    if (imei && imei !== 'all' && day) out[imei] = day;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Al cambiar deviceAccess: conserva fechas de IMEIs que siguen,
 * asigna `defaultFrom` (o hoy) a los nuevos, archiva los quitados en history.
 */
export function mergeDeviceAccessFromOnAssign({
  prevAccess = [],
  nextAccess = [],
  prevFrom = {},
  patchFrom = {},
  defaultFrom = null,
  history = [],
  assignedBy = null,
} = {}) {
  const today = todayAccessDate();
  const fallback = normalizeAccessDate(defaultFrom) || today;
  const prevSet = new Set(
    (Array.isArray(prevAccess) ? prevAccess : [])
      .map(String)
      .filter((x) => x && x !== 'all')
  );
  const nextList = (Array.isArray(nextAccess) ? nextAccess : [])
    .map(String)
    .filter((x) => x && x !== 'all');
  const nextSet = new Set(nextList);
  const prevMap = normalizeDeviceAccessFrom(prevFrom) || {};
  const patchMap = normalizeDeviceAccessFrom(patchFrom) || {};

  const out = {};
  for (const imei of nextList) {
    out[imei] = patchMap[imei] || prevMap[imei] || fallback;
  }

  const nowIso = new Date().toISOString();
  const nextHistory = Array.isArray(history) ? [...history] : [];

  // Cerrar ventanas de IMEIs removidos
  for (const imei of prevSet) {
    if (nextSet.has(imei)) continue;
    const from = prevMap[imei] || today;
    nextHistory.push({
      imei,
      from,
      to: today,
      assignedAt: nowIso,
      assignedBy: assignedBy || undefined,
    });
  }

  // Abrir ventanas nuevas
  for (const imei of nextSet) {
    if (prevSet.has(imei)) continue;
    nextHistory.push({
      imei,
      from: out[imei],
      to: null,
      assignedAt: nowIso,
      assignedBy: assignedBy || undefined,
    });
  }

  // Cap history
  const capped = nextHistory.slice(-200);

  return {
    deviceAccessFrom: Object.keys(out).length ? out : undefined,
    deviceAccessHistory: capped.length ? capped : undefined,
  };
}

export function userAccessFromForImei(user, imei) {
  if (!user) return todayAccessDate();
  if (user.superUser === true || user.category === 'superadmin') return null;
  const access = Array.isArray(user.deviceAccess) ? user.deviceAccess : [];
  if (access.includes('all')) return null;
  const key = String(imei ?? '').trim();
  const map = user.deviceAccessFrom;
  if (map && typeof map === 'object' && map[key]) {
    return normalizeAccessDate(map[key]) || todayAccessDate();
  }
  return null;
}

export function eventAtOnOrAfterAccess(user, imei, atIso) {
  const from = userAccessFromForImei(user, imei);
  if (from == null) return true;
  if (!atIso) return true;
  const day = normalizeAccessDate(atIso);
  if (!day) return true;
  return day >= from;
}
