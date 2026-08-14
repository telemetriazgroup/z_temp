import type { User } from '../../types';
import type { GrupoCorreo, GrupoCorreoDevice } from './types';
import {
  userCanManageUsers,
  userIsSuperAdmin,
  userMayAccessImei,
} from '../usuario';

/** Admin: máximo 2 grupos de correo. */
export const ADMIN_MAX_CORREO_GRUPOS = 2;
/** Admin: máximo 3 destinatarios por grupo. */
export const ADMIN_MAX_CORREO_EMAILS_POR_GRUPO = 3;

export function userCanAccessCorreoConfig(user: User | null | undefined): boolean {
  return userCanManageUsers(user);
}

export function userCanSeeCorreoRemitente(user: User | null | undefined): boolean {
  return userIsSuperAdmin(user);
}

export function userCanSeeCorreoCiclos(user: User | null | undefined): boolean {
  return userIsSuperAdmin(user);
}

export function grupoOwnedBy(
  grupo: GrupoCorreo,
  username: string | null | undefined
): boolean {
  if (!username?.trim()) return false;
  const owner = (grupo.ownerUsername ?? '').trim().toLowerCase();
  return owner !== '' && owner === username.trim().toLowerCase();
}

/** Superadmin ve todos; admin solo los suyos (ownerUsername). */
export function filterGruposCorreoForUser(
  user: User | null | undefined,
  grupos: GrupoCorreo[]
): GrupoCorreo[] {
  if (user == null) return [];
  if (userIsSuperAdmin(user)) return grupos;
  if (!userCanManageUsers(user)) return [];
  return grupos.filter((g) => grupoOwnedBy(g, user.username));
}

export function countGruposOwnedByUser(
  user: User | null | undefined,
  grupos: GrupoCorreo[]
): number {
  if (user == null) return 0;
  return grupos.filter((g) => grupoOwnedBy(g, user.username)).length;
}

export function userMayEditGrupoCorreo(
  user: User | null | undefined,
  grupo: GrupoCorreo
): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  if (!userCanManageUsers(user)) return false;
  return grupoOwnedBy(grupo, user.username);
}

export function maxEmailsForUser(user: User | null | undefined): number | null {
  if (userIsSuperAdmin(user)) return null;
  if (userCanManageUsers(user)) return ADMIN_MAX_CORREO_EMAILS_POR_GRUPO;
  return 0;
}

export function maxGruposForUser(user: User | null | undefined): number | null {
  if (userIsSuperAdmin(user)) return null;
  if (userCanManageUsers(user)) return ADMIN_MAX_CORREO_GRUPOS;
  return 0;
}

/** Admin solo puede asignar IMEIs de su cuenta; superadmin todos. */
export function userMayAssignCorreoDevice(
  user: User | null | undefined,
  device: Pick<GrupoCorreoDevice, 'imei' | 'codigo'> | { imei: string; codigo?: string }
): boolean {
  if (user == null) return false;
  if (userIsSuperAdmin(user)) return true;
  if (!userMayAccessImei(user, device.imei)) return false;
  const allowed = user.allowedCodigos;
  if (Array.isArray(allowed) && allowed.length > 0 && device.codigo) {
    return allowed.includes(device.codigo);
  }
  return true;
}

export function validateGrupoCorreoLimits(
  user: User | null | undefined,
  opts: {
    emails: string[];
    devices: GrupoCorreoDevice[];
    isNew: boolean;
    ownedCount: number;
  }
): string | null {
  if (user == null || !userCanManageUsers(user)) {
    return 'Se requiere admin o superadmin';
  }
  if (userIsSuperAdmin(user)) {
    for (const d of opts.devices) {
      if (!userMayAssignCorreoDevice(user, d)) {
        return `No puede asignar el equipo ${d.imei}`;
      }
    }
    return null;
  }

  const maxG = ADMIN_MAX_CORREO_GRUPOS;
  if (opts.isNew && opts.ownedCount >= maxG) {
    return `Como admin solo puede crear hasta ${maxG} grupos de correo`;
  }
  const maxE = ADMIN_MAX_CORREO_EMAILS_POR_GRUPO;
  if (opts.emails.length > maxE) {
    return `Como admin máximo ${maxE} correos por grupo`;
  }
  for (const d of opts.devices) {
    if (!userMayAssignCorreoDevice(user, d)) {
      return `Solo puede asignar equipos disponibles en su cuenta (${d.imei})`;
    }
  }
  return null;
}
