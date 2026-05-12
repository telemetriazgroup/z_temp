import type { User } from '../../types';

/** IMEI ↔ etiqueta IFF Perú (alineado con túnel / README). */
export const IFF_DEVICE_NAMES: Record<string, string> = {
  '866262034327402': 'IFF ZGRU5295105 MP BIXINAS',
  '863576046886862': 'IFF ZGRU5014454 MATERIA PRIMA #1',
  '863576049740900': 'IFF ZGRU5115406 MATERIA PRIMA #3',
  '868428044595035': 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
  '863576043599872': 'IFF ZGRU7802800 PRODUCTO TERMINADO #2',
  '866262034780196': 'IFF ZGRU6645466 MATERIA PRIMA #2',
};

function deviceNamesForImeis(imeis: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const imei of imeis) {
    const label = IFF_DEVICE_NAMES[imei];
    if (label) out[imei] = label;
  }
  return out;
}

/** Contraseña semilla: mismo identificador de usuario en minúsculas + `2026`. */
export function bootstrapPasswordForUsername(username: string): string {
  return `${username.trim().toLowerCase()}2026`;
}

/** Superusuario: acceso total y módulo Usuarios. */
export const BOOTSTRAP_SUPERADMIN: User = {
  id: 'user-superadmin',
  username: 'superadmin',
  password: bootstrapPasswordForUsername('superadmin'),
  role: 'Administrador',
  deviceAccess: ['all'],
  superUser: true,
};

/** IFF Perú: solo IMEI indicados con nombres definidos. */
export const BOOTSTRAP_IIFPERU: User = {
  id: 'user-iifperu',
  username: 'iifperu',
  password: bootstrapPasswordForUsername('iifperu'),
  role: 'Monitoreo',
  deviceAccess: Object.keys(IFF_DEVICE_NAMES),
  superUser: false,
  deviceNames: { ...IFF_DEVICE_NAMES },
};

const IMEI_ZGRU7807130 = '868428044595035';
const IMEI_ZGRU7802800 = '863576043599872';
const IMEI_ZGRU5014454 = '863576046886862';
const IMEI_ZGRU6645466 = '866262034780196';
const IMEI_ZGRU5115406 = '863576049740900';
const IMEI_ZGRU5295105 = '866262034327402';

/** Cuentas por persona (usuario = correo). Miriam: mismo alcance que Keyla (README sin lista explícita). */
export const BOOTSTRAP_IFF_NAMED_USERS: User[] = [
  {
    id: 'user-keyla-lizarbe',
    username: 'keyla.lizarbe@iff.com',
    password: bootstrapPasswordForUsername('keyla.lizarbe@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU7807130, IMEI_ZGRU7802800],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU7807130, IMEI_ZGRU7802800]),
  },
  {
    id: 'user-miriam-espinoza',
    username: 'Miriam.EspinozaHuaman@IFF.com',
    password: bootstrapPasswordForUsername('Miriam.EspinozaHuaman@IFF.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU7807130, IMEI_ZGRU7802800],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU7807130, IMEI_ZGRU7802800]),
  },
  {
    id: 'user-luis-agapito',
    username: 'luis.agapito@iff.com',
    password: bootstrapPasswordForUsername('luis.agapito@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [
      IMEI_ZGRU7807130,
      IMEI_ZGRU7802800,
      IMEI_ZGRU5014454,
      IMEI_ZGRU6645466,
      IMEI_ZGRU5115406,
    ],
    superUser: false,
    deviceNames: deviceNamesForImeis([
      IMEI_ZGRU7807130,
      IMEI_ZGRU7802800,
      IMEI_ZGRU5014454,
      IMEI_ZGRU6645466,
      IMEI_ZGRU5115406,
    ]),
  },
  {
    id: 'user-luiggi-silvestre',
    username: 'luiggi.silvestre@iff.com',
    password: bootstrapPasswordForUsername('luiggi.silvestre@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU5295105],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU5295105]),
  },
  {
    id: 'user-miguel-parra',
    username: 'miguel.parra@iff.com',
    password: bootstrapPasswordForUsername('miguel.parra@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU5295105],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU5295105]),
  },
  {
    id: 'user-araceli-quispe',
    username: 'Araceli.Quispe@IFF.com',
    password: bootstrapPasswordForUsername('Araceli.Quispe@IFF.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU5295105],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU5295105]),
  },
];

export const BOOTSTRAP_USERS: User[] = [
  BOOTSTRAP_SUPERADMIN,
  BOOTSTRAP_IIFPERU,
  ...BOOTSTRAP_IFF_NAMED_USERS,
];
