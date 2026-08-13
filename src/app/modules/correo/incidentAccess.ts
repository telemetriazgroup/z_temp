import type { User } from '../../types';
import type { CorreoIncidente, GrupoCorreo, GrupoCorreoDevice } from './types';
import { userHasFullDeviceAccess, userMayAccessImei } from '../usuario';

/** Equipo del grupo visible para el usuario (IMEI en su cuenta + origen permitido). */
export function userMayAccessCorreoDevice(
  user: User | null,
  device: GrupoCorreoDevice
): boolean {
  if (user == null) return false;
  if (user.superUser === true) return true;
  if (!userMayAccessImei(user, device.imei)) return false;
  const allowed = user.allowedCodigos;
  if (Array.isArray(allowed) && allowed.length > 0 && device.codigo) {
    return allowed.includes(device.codigo);
  }
  return true;
}

function iterEquiposCorreoActivos(grupos: GrupoCorreo[]): GrupoCorreoDevice[] {
  const out: GrupoCorreoDevice[] = [];
  for (const g of grupos) {
    if (!g.enabled) continue;
    for (const d of g.devices ?? []) {
      if (d.enabled) out.push(d);
    }
  }
  return out;
}

/** Usuario puede ver incidentes si tiene algún equipo activo en grupos de correo. */
export function userHasCorreoIncidentAccess(
  user: User | null,
  grupos: GrupoCorreo[]
): boolean {
  if (user == null) return false;
  if (user.superUser === true) return true;
  return iterEquiposCorreoActivos(grupos).some((d) => userMayAccessCorreoDevice(user, d));
}

/** rowKeys de equipos activos en grupos que el usuario tiene en su cuenta. */
export function rowKeysCorreoActivosForUser(
  user: User | null,
  grupos: GrupoCorreo[]
): string[] {
  if (user == null) return [];
  const set = new Set<string>();
  for (const d of iterEquiposCorreoActivos(grupos)) {
    if (userMayAccessCorreoDevice(user, d)) set.add(d.rowKey);
  }
  return [...set];
}

export function imeisCorreoForUser(user: User | null, grupos: GrupoCorreo[]): string[] {
  const set = new Set<string>();
  for (const d of iterEquiposCorreoActivos(grupos)) {
    if (userMayAccessCorreoDevice(user, d)) set.add(d.imei);
  }
  return [...set];
}

/** Superusuario ve todos; demás usuarios solo incidentes de sus equipos activos en correo. */
export function incidenteVisibleParaUser(
  user: User | null,
  inc: CorreoIncidente,
  grupos: GrupoCorreo[]
): boolean {
  if (user == null) return false;
  if (user.superUser === true) return true;
  const rowKeys = new Set(rowKeysCorreoActivosForUser(user, grupos));
  return rowKeys.has(inc.rowKey);
}

export function diaRelativoLabel(diaCalendario: string, hoy: string, ayer: string): string {
  if (diaCalendario === hoy) return 'Hoy';
  if (diaCalendario === ayer) return 'Ayer';
  return diaCalendario;
}

export function tipoEventoLabel(tipo: 'operaciones' | 'mantenimiento'): string {
  return tipo === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones';
}
