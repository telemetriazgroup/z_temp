import type { User, UserCategory } from '../../types';
import { IFF_STYLE_ACCOUNT_USERNAMES } from './bootstrapUsers';
import { effectiveDeviceAccessForUser } from '../administracion/gruposEquiposCache';

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

/** Menú restringido para rol Monitoreo (no superadmin/admin). */
export function userIsMonitoreoNavigation(user: User | null): boolean {
  if (user == null) return false;
  if (userCanManageUsers(user)) return false;
  return user.role === 'Monitoreo';
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
  return eff.includes(imei);
}

/** IMEI + origen (TUNEL / STARCOOL / STARCOOL2 / TERMOKING) según perfil del usuario. */
export function userMayAccessDispositivo(
  user: User | null,
  dispositivo: import('../../types').DispositivoUltimoEstado
): boolean {
  if (!userMayAccessImei(user, dispositivo.imei)) return false;
  const allowed = user?.allowedCodigos;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  if (dispositivo.codigo == null) return true;
  return allowed.includes(dispositivo.codigo);
}

export function displayNameForDevice(
  user: User | null,
  imei: string,
  rowKey: string,
  localNames: Record<string, string>,
  sinAsignar: string
): string {
  const profile = user?.deviceNames?.[imei]?.trim();
  if (profile) return profile;
  const local = localNames[rowKey]?.trim();
  return local ? local : sinAsignar;
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
