import type { SessionUser, User } from '../../types';

/** Perfil con permisos de equipos (contraseña opcional). */
type UserAccessProfile = Pick<User, 'superUser' | 'deviceAccess'> | SessionUser | null;

export function userHasFullDeviceAccess(user: UserAccessProfile): boolean {
  if (user == null) return false;
  if (user.superUser === true) return true;
  return user.deviceAccess.includes('all');
}

export function userMayAccessImei(user: UserAccessProfile, imei: string): boolean {
  if (user == null) return false;
  if (userHasFullDeviceAccess(user)) return true;
  return user.deviceAccess.includes(imei);
}

export function displayNameForDevice(
  user: UserAccessProfile,
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
