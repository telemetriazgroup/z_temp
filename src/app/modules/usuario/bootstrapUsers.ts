import type { User } from '../../types';

/** Superusuario: acceso total y módulo Usuarios. */
export const BOOTSTRAP_SUPERADMIN: User = {
  id: 'user-superadmin',
  username: 'superadmin',
  password: 'Super.Ztrack2024',
  role: 'Administrador',
  deviceAccess: ['all'],
  superUser: true,
};

/** IFF Perú: solo IMEI indicados con nombres definidos. */
export const BOOTSTRAP_IIFPERU: User = {
  id: 'user-iifperu',
  username: 'iifperu',
  password: 'Iif.Peru2024',
  role: 'Monitoreo',
  deviceAccess: [
    '866262034327402',
    '863576046886862',
    '863576049740900',
    '868428044595035',
    '863576043599872',
    '866262034780196',
  ],
  superUser: false,
  deviceNames: {
    '866262034327402': 'IFF ZGRU5295105 MP BIXINAS',
    '863576046886862': 'IFF ZGRU5014454 MATERIA PRIMA #1',
    '863576049740900': 'IFF ZGRU5115406 MATERIA PRIMA #3',
    '868428044595035': 'IFF ZGRU7807130 PRODUCTO TERMINADO #1',
    '863576043599872': 'IFF ZGRU7802800 PRODUCTO TERMINADO #2',
    '866262034780196': 'IFF ZGRU6645466 MATERIA PRIMA #2',
  },
};

export const BOOTSTRAP_USERS: User[] = [BOOTSTRAP_SUPERADMIN, BOOTSTRAP_IIFPERU];
