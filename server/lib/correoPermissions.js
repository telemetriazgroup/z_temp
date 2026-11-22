import {
  isSuperAdminUser,
  isAdminUser,
  canManageUsers,
} from './usersRepository.js';
import { resolveUserEffectiveImeis } from './gruposEquiposRepository.js';
import { normalizarTelefono } from './wa/telefono.js';

export const ADMIN_MAX_CORREO_GRUPOS = 2;
export const ADMIN_MAX_CORREO_EMAILS_POR_GRUPO = 3;

export function grupoOwnedBy(grupo, username) {
  if (!username) return false;
  const owner = String(grupo?.ownerUsername ?? '')
    .trim()
    .toLowerCase();
  return owner !== '' && owner === String(username).trim().toLowerCase();
}

export function filterGruposForActor(actor, grupos) {
  if (!actor) return [];
  if (isSuperAdminUser(actor)) return grupos;
  if (!canManageUsers(actor)) return [];
  return grupos.filter((g) => grupoOwnedBy(g, actor.username));
}

export function actorMayAccessImei(actor, imei) {
  if (!actor) return false;
  const allowed = resolveUserEffectiveImeis(actor);
  if (allowed == null) return true;
  return allowed.includes(String(imei));
}

export function normalizarWhatsappNumeros(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return [];
  const vistos = new Set();
  const out = [];
  for (const item of lista) {
    const nombre = String(item?.nombre ?? '').trim();
    const telefono = normalizarTelefono(item?.telefono);
    if (!nombre) throw new Error('Cada número de WhatsApp necesita un nombre');
    if (telefono.length < 11) {
      throw new Error('El número de WhatsApp debe incluir el prefijo 51 y 9 dígitos');
    }
    if (vistos.has(telefono)) continue;
    vistos.add(telefono);
    out.push({ nombre, telefono });
  }
  return out;
}

/**
 * @returns {{ ok: true, grupo: object } | { ok: false, error: string }}
 */
export function validateAndNormalizeGrupoSave(actor, grupo, allGrupos) {
  if (!actor || !canManageUsers(actor)) {
    return { ok: false, error: 'Se requiere admin o superadmin' };
  }
  if (!grupo?.id || !grupo?.nombre) {
    return { ok: false, error: 'Grupo inválido' };
  }

  const emails = Array.isArray(grupo.emails)
    ? grupo.emails.map((e) => String(e).trim()).filter(Boolean)
    : [];
  const devices = Array.isArray(grupo.devices) ? grupo.devices : [];
  const existing = allGrupos.find((g) => g.id === grupo.id);
  const isNew = !existing;

  if (isSuperAdminUser(actor)) {
    let whatsappNumeros = [];
    try {
      whatsappNumeros = normalizarWhatsappNumeros(grupo.whatsappNumeros);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return {
      ok: true,
      grupo: {
        ...grupo,
        emails,
        devices,
        whatsappActivo: grupo.whatsappActivo === true,
        whatsappNumeros,
        ownerUsername:
          existing?.ownerUsername ??
          grupo.ownerUsername ??
          actor.username,
      },
    };
  }

  // Admin
  if (existing && !grupoOwnedBy(existing, actor.username)) {
    return { ok: false, error: 'No puede editar un grupo de otro usuario' };
  }
  const ownedCount = allGrupos.filter((g) =>
    grupoOwnedBy(g, actor.username)
  ).length;
  if (isNew && ownedCount >= ADMIN_MAX_CORREO_GRUPOS) {
    return {
      ok: false,
      error: `Como admin solo puede crear hasta ${ADMIN_MAX_CORREO_GRUPOS} grupos de correo`,
    };
  }
  if (emails.length > ADMIN_MAX_CORREO_EMAILS_POR_GRUPO) {
    return {
      ok: false,
      error: `Como admin máximo ${ADMIN_MAX_CORREO_EMAILS_POR_GRUPO} correos por grupo`,
    };
  }
  for (const d of devices) {
    if (!actorMayAccessImei(actor, d.imei)) {
      return {
        ok: false,
        error: `Solo puede asignar equipos disponibles (${d.imei})`,
      };
    }
  }

  return {
    ok: true,
    grupo: {
      ...grupo,
      emails,
      devices,
      whatsappActivo: existing?.whatsappActivo === true,
      whatsappNumeros: Array.isArray(existing?.whatsappNumeros) ? existing.whatsappNumeros : [],
      ownerUsername: actor.username,
    },
  };
}
