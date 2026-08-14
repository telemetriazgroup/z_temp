/** Usuarios semilla (alineado con src/app/modules/usuario/bootstrapUsers.ts). */

export const IFF_DEVICE_NAMES = {
  '866262034327402': 'IFF ZGRU5295105 MP BIXINAS',
  '863576046886862': 'IFF ZGRU5014454 MATERIA PRIMA #1',
  '863576049740900': 'IFF ZGRU5115406 MATERIA PRIMA #3',
  '868428044595035': 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
  '863576043599872': 'IFF ZGRU7802800 PRODUCTO TERMINADO #2',
  '866262034780196': 'IFF ZGRU6645466 MATERIA PRIMA #2',
};

export const IFF_ALL_IMEIS = Object.keys(IFF_DEVICE_NAMES);

export const OVO_SURCHINCHA_IMEI = '868428043798341';

export const OVO_SURCHINCHA_DEVICE_NAMES = {
  [OVO_SURCHINCHA_IMEI]: 'OVO SUR CHINCHA',
};

function deviceNamesForImeis(imeis) {
  const out = {};
  for (const imei of imeis) {
    const label = IFF_DEVICE_NAMES[imei];
    if (label) out[imei] = label;
  }
  return out;
}

export function bootstrapPasswordForUsername(username) {
  const u = username.trim().toLowerCase();
  const at = u.indexOf('@');
  const local = at >= 0 ? u.slice(0, at) : u;
  return `${local}2026`;
}

export const BOOTSTRAP_SUPERADMIN = {
  id: 'user-superadmin',
  username: 'superadmin',
  password: bootstrapPasswordForUsername('superadmin'),
  role: 'Administrador',
  category: 'superadmin',
  deviceAccess: ['all'],
  superUser: true,
};

/** Admins con visibilidad a toda la flota; sin acceso a auditoría. */
export const BOOTSTRAP_JEFEDESARROLLO = {
  id: 'user-jefedesarrollo',
  username: 'jefedesarrollo',
  password: bootstrapPasswordForUsername('jefedesarrollo'),
  role: 'Administrador',
  category: 'admin',
  deviceAccess: ['all'],
  superUser: false,
  maxManagedUsers: 3,
  displayName: 'Jefe Desarrollo',
  cargo: 'Administrador',
};

export const BOOTSTRAP_ELECTRONICOZ = {
  id: 'user-electronicoz',
  username: 'electronicoz',
  password: bootstrapPasswordForUsername('electronicoz'),
  role: 'Administrador',
  category: 'admin',
  deviceAccess: ['all'],
  superUser: false,
  maxManagedUsers: 3,
  displayName: 'Electrónico Z',
  cargo: 'Administrador',
};

export const BOOTSTRAP_IIFPERU = {
  id: 'user-iifperu',
  username: 'iifperu',
  password: bootstrapPasswordForUsername('iifperu'),
  role: 'Monitoreo',
  category: 'user',
  deviceAccess: IFF_ALL_IMEIS,
  superUser: false,
  deviceNames: { ...IFF_DEVICE_NAMES },
};

const IMEI_ZGRU7807130 = '868428044595035';
const IMEI_ZGRU7802800 = '863576043599872';
const IMEI_ZGRU5014454 = '863576046886862';
const IMEI_ZGRU6645466 = '866262034780196';
const IMEI_ZGRU5115406 = '863576049740900';
const IMEI_ZGRU5295105 = '866262034327402';

export const BOOTSTRAP_IFF_NAMED_USERS = [
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
    username: 'miriam.espinozahuaman@iff.com',
    password: bootstrapPasswordForUsername('miriam.espinozahuaman@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [...IFF_ALL_IMEIS],
    superUser: false,
    deviceNames: { ...IFF_DEVICE_NAMES },
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
    username: 'araceli.quispe@iff.com',
    password: bootstrapPasswordForUsername('araceli.quispe@iff.com'),
    role: 'Monitoreo',
    deviceAccess: [IMEI_ZGRU5295105],
    superUser: false,
    deviceNames: deviceNamesForImeis([IMEI_ZGRU5295105]),
  },
];

export const BOOTSTRAP_OVO_SURCHINCHA = {
  id: 'user-ovosurchincha',
  username: 'ovosurchincha',
  password: bootstrapPasswordForUsername('ovosurchincha'),
  role: 'Monitoreo',
  deviceAccess: [OVO_SURCHINCHA_IMEI],
  allowedCodigos: ['TUNEL'],
  superUser: false,
  deviceNames: { ...OVO_SURCHINCHA_DEVICE_NAMES },
};

export const BOOTSTRAP_USERS = [
  BOOTSTRAP_SUPERADMIN,
  BOOTSTRAP_JEFEDESARROLLO,
  BOOTSTRAP_ELECTRONICOZ,
  BOOTSTRAP_IIFPERU,
  BOOTSTRAP_OVO_SURCHINCHA,
  ...BOOTSTRAP_IFF_NAMED_USERS,
];
