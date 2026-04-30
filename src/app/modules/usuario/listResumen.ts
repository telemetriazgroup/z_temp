import type { DispositivoUltimoEstado, ResumenDispositivos } from '../../types';

/** Recalcula totales a partir de una lista visible (p. ej. usuario restringido). */
export function resumenFromDispositivos(
  list: DispositivoUltimoEstado[],
  zonaHorariaFallback: string
): ResumenDispositivos {
  let online = 0;
  let wait = 0;
  let offline = 0;
  let en_defrost = 0;
  let power_on = 0;
  let power_off = 0;

  for (const d of list) {
    if (d.estado_conexion === 'online') online++;
    else if (d.estado_conexion === 'wait') wait++;
    else offline++;
    if (d.en_defrost === true) en_defrost++;
    if (d.power_state_texto === 'on') power_on++;
    else if (d.power_state_texto === 'off') power_off++;
  }

  return {
    total_dispositivos: list.length,
    online,
    wait,
    offline,
    en_defrost,
    power_on,
    power_off,
    zona_horaria: zonaHorariaFallback,
  };
}
