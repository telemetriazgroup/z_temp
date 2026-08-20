import type { User } from '../../types';
import { userIsSuperAdmin, userHasFullDeviceAccess } from './userPermissions';

/** Normaliza a YYYY-MM-DD (inicio del día en Lima-ish ISO date). */
export function normalizeAccessDate(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function todayAccessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fecha desde la cual el usuario puede ver datos del IMEI.
 * Superadmin / flota completa: sin límite (null).
 */
export function userAccessFromForImei(
  user: User | null | undefined,
  imei: string
): string | null {
  if (user == null) return todayAccessDate();
  if (userIsSuperAdmin(user) || userHasFullDeviceAccess(user)) return null;
  const key = String(imei ?? '').trim();
  if (!key) return todayAccessDate();
  const map = user.deviceAccessFrom;
  if (map && typeof map === 'object' && map[key]) {
    return normalizeAccessDate(map[key]) ?? todayAccessDate();
  }
  // Sin fecha explícita: no bloquear por fecha (compat), pero preferible setear al asignar.
  return null;
}

/** true si el instante está dentro de la ventana permitida para ese IMEI. */
export function userMayAccessDataAt(
  user: User | null | undefined,
  imei: string,
  at: string | Date | null | undefined
): boolean {
  const from = userAccessFromForImei(user, imei);
  if (from == null) return true;
  if (at == null) return true;
  const atDate = normalizeAccessDate(
    typeof at === 'string' ? at : at.toISOString()
  );
  if (!atDate) return true;
  return atDate >= from;
}

/**
 * Si el rango pedido empieza antes del acceso, retorna mensaje + rango clamp.
 */
export function clampRangeToAccess(
  user: User | null | undefined,
  imei: string,
  fromIso: string,
  toIso: string
): {
  ok: boolean;
  from: string;
  to: string;
  accessFrom: string | null;
  message?: string;
} {
  const accessFrom = userAccessFromForImei(user, imei);
  if (accessFrom == null) {
    return { ok: true, from: fromIso, to: toIso, accessFrom: null };
  }
  const fromDay = normalizeAccessDate(fromIso) ?? fromIso.slice(0, 10);
  const toDay = normalizeAccessDate(toIso) ?? toIso.slice(0, 10);
  if (toDay < accessFrom) {
    return {
      ok: false,
      from: fromIso,
      to: toIso,
      accessFrom,
      message: `No tiene acceso a datos anteriores al ${accessFrom}. El dispositivo está habilitado para su cuenta desde esa fecha.`,
    };
  }
  if (fromDay < accessFrom) {
    return {
      ok: true,
      from: `${accessFrom}T00:00:00`,
      to: toIso,
      accessFrom,
      message: `Mostrando desde ${accessFrom} (inicio de su asignación).`,
    };
  }
  return { ok: true, from: fromIso, to: toIso, accessFrom };
}
