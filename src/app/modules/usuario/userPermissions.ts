import type { User, UserCategory } from '../../types';
import { IFF_STYLE_ACCOUNT_USERNAMES } from './bootstrapUsers';
import { effectiveDeviceAccessForUser } from '../administracion/gruposEquiposCache';
import { accesoCubreDispositivo } from '../administracion/asignacionEquipo';

export function resolveUserCategory(user: User | null | undefined): UserCategory {
  if (user == null) return 'user';
  if (user.superUser === true) return 'superadmin';
  const c = (user.category ?? '').trim().toLowerCase();
  if (c === 'superadmin' || c === 'admin' || c === 'user') return c;
  return 'user';
}

export function userIsSuperAdmin(user: User | null | undefined): boolean {
  return resolveUserCategory(user) === 'superadmin';
}

export function userIsAdmin(user: User | null | undefined): boolean {
  return resolveUserCategory(user) === 'admin';
}

/** Superadmin o admin: pueden gestionar usuarios. */
export function userCanManageUsers(user: User | null | undefined): boolean {
  const c = resolveUserCategory(user);
  return c === 'superadmin' || c === 'admin';
}

/** Solo superadmin ve auditoría de cambios / telemetría por usuario. */
export function userCanAccessAudit(user: User | null | undefined): boolean {
  return userIsSuperAdmin(user);
}

export function adminMaxManagedUsers(user: User | null | undefined): number {
  const n = Number(user?.maxManagedUsers);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 3;
}

/** Normaliza `deviceAccess` aunque falte en sesiones/usuarios antiguos. */
export function deviceAccessList(user: User | null | undefined): string[] {
  if (user == null) return [];
  return Array.isArray(user.deviceAccess) ? user.deviceAccess : [];
}

/** Menú restringido para usuarios operativos (no admin/superadmin). */
export function userIsMonitoreoNavigation(user: User | null): boolean {
  if (user == null) return false;
  if (userCanManageUsers(user)) return false;
  return true;
}

/** Operativo restringido: cuentas semilla tipo IFF o correo `@iff.com` (no superusuario). */
export function userIsIffRestrictedNavigation(user: User | null): boolean {
  if (user == null || userCanManageUsers(user)) return false;
  const u = user.username?.trim().toLowerCase() ?? '';
  if ((IFF_STYLE_ACCOUNT_USERNAMES as readonly string[]).includes(u)) return true;
  return u.endsWith('@iff.com');
}

export function userHasFullDeviceAccess(user: User | null): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  return deviceAccessList(user).includes('all');
}

/**
 * Usuario sin flota efectiva (ni IMEI directo ni grupos).
 * Superadmin nunca; admin/user con lista vacía sí.
 */
export function userHasNoFleetAccess(user: User | null | undefined): boolean {
  if (user == null) return true;
  if (userIsSuperAdmin(user)) return false;
  const eff = effectiveDeviceAccessForUser(user);
  if (eff === 'all') return false;
  return eff.length === 0;
}

export function userMayAccessImei(user: User | null, imei: string): boolean {
  if (user == null) return false;
  if (userHasFullDeviceAccess(user)) return true;
  const eff = effectiveDeviceAccessForUser(user);
  if (eff === 'all') return true;
  return eff.some((token) => {
    if (token === imei) return true;
    const sep = token.lastIndexOf('|');
    return sep > 0 && token.slice(sep + 1) === imei;
  });
}

/** IMEI + origen (TUNEL / STARCOOL / STARCOOL2 / TERMOKING) según perfil del usuario. */
export function userMayAccessDispositivo(
  user: User | null,
  dispositivo: { imei: string; codigo?: string | null },
  duplicados?: Set<string>
): boolean {
  if (user == null) return false;
  if (userHasFullDeviceAccess(user)) return true;
  const eff = effectiveDeviceAccessForUser(user);
  if (eff === 'all') return true;
  if (!accesoCubreDispositivo(eff, dispositivo, duplicados ?? new Set())) return false;
  const allowed = user?.allowedCodigos;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  if (dispositivo.codigo == null) return true;
  return allowed.includes(dispositivo.codigo);
}

function nombreLocalLimpio(value: string | undefined): string | null {
  const s = value?.trim() ?? '';
  if (!s || s === '—' || s.toUpperCase() === 'SIN ASIGNAR') return null;
  return s;
}

/** StarCool y StarCool2 comparten el nombre guardado en el navegador. Túnel y ThermoKing no. */
function nombreLocalCompartido(
  localNames: Record<string, string>,
  imei: string,
  rowKey: string
): string | null {
  const directo = nombreLocalLimpio(localNames[rowKey]);
  if (directo) return directo;
  const dash = rowKey.indexOf('-');
  const codigo = (dash >= 0 ? rowKey.slice(0, dash) : '').toUpperCase();
  const id = (dash >= 0 ? rowKey.slice(dash + 1) : imei).trim();
  if (!id) return null;
  if (codigo === 'STARCOOL' || codigo === 'STARCOOL2') {
    return (
      nombreLocalLimpio(localNames[`STARCOOL-${id}`]) ||
      nombreLocalLimpio(localNames[`STARCOOL2-${id}`])
    );
  }
  if (codigo === 'TERMOKING' || codigo === 'THERMOKING') {
    return (
      nombreLocalLimpio(localNames[`TERMOKING-${id}`]) ||
      nombreLocalLimpio(localNames[`THERMOKING-${id}`])
    );
  }
  return null;
}

export function displayNameForDevice(
  user: User | null,
  imei: string,
  rowKey: string,
  localNames: Record<string, string>,
  sinAsignar: string,
  imeiCompartido = false
): string {
  const local = nombreLocalCompartido(localNames, imei, rowKey);
  if (local) return local;
  if (!imeiCompartido) {
    const profile = user?.deviceNames?.[imei]?.trim();
    if (profile) return profile;
  }
  return sinAsignar;
}

export function countSuperUsers(users: User[]): number {
  return users.filter((u) => userIsSuperAdmin(u)).length;
}

export function categoryLabel(user: User | null | undefined): string {
  const c = resolveUserCategory(user);
  if (c === 'superadmin') return 'Superadmin';
  if (c === 'admin') return 'Admin';
  return 'Usuario';
}

/**
 * Panel de control de temperaturas (comandos reefer).
 * Superadmin: siempre habilitado.
 * Resto: solo si un admin/superadmin lo habilitó explícitamente (`puedeControlTemperatura`).
 * Por defecto desactivado para usuarios no superadmin.
 */
export function userMayControlTemperatura(user: User | null | undefined): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  return user.puedeControlTemperatura === true;
}

/**
 * Análisis de telemetría en detalle de equipo.
 * Superadmin siempre; resto solo con flag explícito.
 */
export function userMayAnalisisTelemetria(user: User | null | undefined): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  return user.puedeAnalisisTelemetria === true;
}

/** Pestaña de incidentes del equipo. Superadmin siempre; admin solo si él se lo marcó. */
export function userMayIncidentes(user: User | null | undefined): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  return resolveUserCategory(user) === 'admin' && user.puedeIncidentes === true;
}

/** Admin solo puede otorgar un permiso si él mismo lo tiene (o es superadmin). */
export function actorMayGrantPermission(
  actor: User | null | undefined,
  permission: 'puedeControlTemperatura' | 'puedeAnalisisTelemetria'
): boolean {
  if (actor == null) return false;
  if (userIsSuperAdmin(actor)) return true;
  return actor[permission] === true;
}
