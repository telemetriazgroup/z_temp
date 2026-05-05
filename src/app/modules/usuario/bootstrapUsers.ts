import type { User } from '../../types';

/** Los 6 equipos IFF Perú — mismo alcance que `iifperu` y usuarios operativos adicionales. */
const IFF_PERU_DEVICE_ACCESS: string[] = [
  '866262034327402',
  '863576046886862',
  '863576049740900',
  '868428044595035',
  '863576043599872',
  '866262034780196',
];

const IFF_PERU_DEVICE_NAMES: Record<string, string> = {
  '866262034327402': 'IFF ZGRU5295105 MP BIXINAS',
  '863576046886862': 'IFF ZGRU5014454 MATERIA PRIMA #1',
  '863576049740900': 'IFF ZGRU5115406 MATERIA PRIMA #3',
  '868428044595035': 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
  '863576043599872': 'IFF ZGRU7802800 PRODUCTO TERMINADO #2',
  '866262034780196': 'IFF ZGRU6645466 MATERIA PRIMA #2',
};

/** Superusuario: acceso total y módulo Usuarios. */
export const BOOTSTRAP_SUPERADMIN: User = {
  id: 'user-superadmin',
  nombre: 'Superusuario ZTRACK',
  correo: 'admin@ztrack.local',
  username: 'superadmin',
  password: 'Super.Ztrack2024',
  empresa: 'ZTRACK',
  role: 'Administrador',
  deviceAccess: ['all'],
  superUser: true,
};

/** IFF Perú: cuenta operativa histórica. */
export const BOOTSTRAP_IIFPERU: User = {
  id: 'user-iifperu',
  nombre: 'IFF Perú (operativo)',
  correo: 'operaciones@iff-pe.local',
  username: 'iifperu',
  password: 'Iif.Peru2024',
  empresa: 'IFF Perú',
  role: 'Monitoreo',
  deviceAccess: [...IFF_PERU_DEVICE_ACCESS],
  superUser: false,
  deviceNames: { ...IFF_PERU_DEVICE_NAMES },
};

/** Usuario IFF — mismos 6 equipos que `iifperu`. */
export const BOOTSTRAP_ANGEL_SUSAYA: User = {
  id: 'user-angel-susaya',
  nombre: 'Ángel Susaya',
  correo: 'angel.susaya@iff-pe.local',
  username: 'angel.susaya',
  password: 'controlangelsus!',
  empresa: 'IFF Perú',
  role: 'Monitoreo',
  deviceAccess: [...IFF_PERU_DEVICE_ACCESS],
  superUser: false,
  deviceNames: { ...IFF_PERU_DEVICE_NAMES },
};

export const BOOTSTRAP_LUIS_AGAPITO: User = {
  id: 'user-luis-agapito',
  nombre: 'Luis Agapito',
  correo: 'luis.agapito@iff-pe.local',
  username: 'luis.agapito',
  password: 'controlluisaga!',
  empresa: 'IFF Perú',
  role: 'Monitoreo',
  deviceAccess: [...IFF_PERU_DEVICE_ACCESS],
  superUser: false,
  deviceNames: { ...IFF_PERU_DEVICE_NAMES },
};

export const BOOTSTRAP_KEYLA_LIZARBE: User = {
  id: 'user-keyla-lizarbe',
  nombre: 'Keyla Lizarbe',
  correo: 'keyla.lizarbe@iff-pe.local',
  username: 'keyla.lizarbe',
  password: 'controlkeylaliz!',
  empresa: 'IFF Perú',
  role: 'Monitoreo',
  deviceAccess: [...IFF_PERU_DEVICE_ACCESS],
  superUser: false,
  deviceNames: { ...IFF_PERU_DEVICE_NAMES },
};

export const BOOTSTRAP_USERS: User[] = [
  BOOTSTRAP_SUPERADMIN,
  BOOTSTRAP_IIFPERU,
  BOOTSTRAP_ANGEL_SUSAYA,
  BOOTSTRAP_LUIS_AGAPITO,
  BOOTSTRAP_KEYLA_LIZARBE,
];
