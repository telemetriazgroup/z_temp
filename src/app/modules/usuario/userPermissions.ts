import type { User } from '../../types';

/** IFF Perú operativo: `iifperu` o correo `@iff.com` (no superusuario). Solo ven Listado en el menú. */
export function userIsIffRestrictedNavigation(user: User | null): boolean {
  if (user == null || user.superUser === true) return false;
  const u = user.username.trim().toLowerCase();
  if (u === 'iifperu') return true;
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
