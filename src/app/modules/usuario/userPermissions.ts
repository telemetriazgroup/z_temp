import type { User } from '../../types';

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
