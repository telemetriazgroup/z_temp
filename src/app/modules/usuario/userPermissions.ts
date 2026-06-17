import type { User, DispositivoUltimoEstado } from '../../types';
import { IFF_STYLE_ACCOUNT_USERNAMES } from './bootstrapUsers';

/** Operativo restringido: cuentas semilla tipo IFF o correo `@iff.com` (no superusuario). */
export function userIsIffRestrictedNavigation(user: User | null): boolean {
  if (user == null || user.superUser === true) return false;
  const u = user.username.trim().toLowerCase();
  if ((IFF_STYLE_ACCOUNT_USERNAMES as readonly string[]).includes(u)) return true;
  return u.endsWith('@iff.com');
}

export function userHasFullDeviceAccess(user: User | null): boolean {
  if (user == null) return false;
  if (user.superUser === true) return true;
  return user.deviceAccess.includes('all');
}

export function userMayAccessImei(user: User | null, imei: string): boolean {
  if (user == null) return false;
  if (userHasFullDeviceAccess(user)) return true;
  return user.deviceAccess.includes(imei);
}

/** IMEI + origen (TUNEL / STARCOOL / TERMOKING) según perfil del usuario. */
export function userMayAccessDispositivo(
  user: User | null,
  dispositivo: DispositivoUltimoEstado
): boolean {
  if (!userMayAccessImei(user, dispositivo.imei)) return false;
  const allowed = user?.allowedCodigos;
  if (allowed == null || allowed.length === 0) return true;
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
  return users.filter((u) => u.superUser === true).length;
}
