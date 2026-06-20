import type { User, DispositivoUltimoEstado } from '../../types';
import { readDeviceLocalNames } from '../../lib/deviceLocalNames';
import { displayNameForDevice } from '../usuario';
import { deviceRowKey } from './alertEngine';

const SIN_ASIGNAR = 'SIN ASIGNAR';

/** Nombre visible en listado para un dispositivo. */
export function nombrePlataformaForDevice(
  user: User | null,
  d: DispositivoUltimoEstado,
  localNames?: Record<string, string>
): string {
  const locals = localNames ?? readDeviceLocalNames();
  const rk = deviceRowKey(d);
  return displayNameForDevice(user, d.imei, rk, locals, SIN_ASIGNAR);
}

/** Mapa imei → nombre para sincronizar con el servidor de correo. */
export function buildDeviceNamesForServer(
  user: User | null,
  dispositivos: DispositivoUltimoEstado[],
  localNames?: Record<string, string>
): Record<string, string> {
  const locals = localNames ?? readDeviceLocalNames();
  const out: Record<string, string> = {};

  if (user?.deviceNames) {
    for (const [imei, name] of Object.entries(user.deviceNames)) {
      const trimmed = name?.trim();
      if (trimmed && trimmed !== SIN_ASIGNAR) out[imei] = trimmed;
    }
  }

  for (const d of dispositivos) {
    const name = nombrePlataformaForDevice(user, d, locals);
    if (name !== SIN_ASIGNAR) out[d.imei] = name;
  }

  return out;
}

export function enrichGrupoDevicesWithNames(
  devices: import('./types').GrupoCorreoDevice[],
  dispositivos: DispositivoUltimoEstado[],
  user: User | null,
  localNames?: Record<string, string>
): import('./types').GrupoCorreoDevice[] {
  const locals = localNames ?? readDeviceLocalNames();
  return devices.map((dev) => {
    const d = dispositivos.find((x) => deviceRowKey(x) === dev.rowKey);
    if (d == null) return dev;
    const nombre = nombrePlataformaForDevice(user, d, locals);
    if (nombre === SIN_ASIGNAR) return dev;
    return {
      ...dev,
      nombrePlataforma: dev.nombrePlataforma?.trim() || nombre,
    };
  });
}
