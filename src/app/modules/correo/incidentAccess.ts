import type { User } from '../../types';
import type { GrupoCorreo } from './types';
import { userHasFullDeviceAccess, userMayAccessImei } from '../usuario';

/** Usuario puede ver incidentes si tiene algún IMEI en grupos de correo activos. */
export function userHasCorreoIncidentAccess(
  user: User | null,
  grupos: GrupoCorreo[]
): boolean {
  if (user == null) return false;
  const activos = grupos.filter((g) => g.enabled);
  if (activos.length === 0) return false;
  if (userHasFullDeviceAccess(user)) return true;
  return activos.some((g) =>
    g.devices.some((d) => d.enabled && userMayAccessImei(user, d.imei))
  );
}

export function imeisCorreoForUser(user: User | null, grupos: GrupoCorreo[]): string[] {
  if (user == null) return [];
  const set = new Set<string>();
  for (const g of grupos) {
    if (!g.enabled) continue;
    for (const d of g.devices) {
      if (!d.enabled) continue;
      if (userHasFullDeviceAccess(user) || userMayAccessImei(user, d.imei)) {
        set.add(d.imei);
      }
    }
  }
  return [...set];
}

export function diaRelativoLabel(diaCalendario: string, hoy: string, ayer: string): string {
  if (diaCalendario === hoy) return 'Hoy';
  if (diaCalendario === ayer) return 'Ayer';
  return diaCalendario;
}

export function tipoEventoLabel(tipo: 'operaciones' | 'mantenimiento'): string {
  return tipo === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones';
}
