import type { GrupoEquipo, User } from '../../types';

let cache: GrupoEquipo[] = [];

export function setGruposEquiposCache(grupos: GrupoEquipo[]): void {
  cache = Array.isArray(grupos) ? grupos.map((g) => ({ ...g })) : [];
}

export function getGruposEquiposCache(): GrupoEquipo[] {
  return cache;
}

export function imeisFromGroupIds(
  groupIds: string[] | undefined | null,
  grupos: GrupoEquipo[] = cache
): string[] {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return [];
  const idSet = new Set(groupIds.map(String));
  const out = new Set<string>();
  for (const g of grupos) {
    if (!idSet.has(g.id)) continue;
    for (const imei of g.imeis ?? []) {
      if (imei) out.add(String(imei));
    }
  }
  return [...out];
}

/** Acceso efectivo: 'all' o lista de IMEI (directos + grupos). */
export function effectiveDeviceAccessForUser(
  user: User | null | undefined,
  grupos: GrupoEquipo[] = cache
): 'all' | string[] {
  if (user == null) return [];
  const cat = String(user.category ?? '').toLowerCase();
  if (user.superUser === true || cat === 'superadmin') {
    return 'all';
  }
  const access = Array.isArray(user.deviceAccess) ? user.deviceAccess.map(String) : [];
  if (access.includes('all')) return 'all';
  const direct = access.filter((x) => x && x !== 'all');
  const fromGroups = imeisFromGroupIds(user.groupIds, grupos);
  return [...new Set([...direct, ...fromGroups])];
}
