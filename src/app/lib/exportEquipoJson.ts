import type { DispositivoUltimoEstado } from '../types';
import { downloadJsonFile } from './downloadJson';

export function exportEquipoUltimoEstadoJson(
  dispositivo: DispositivoUltimoEstado,
  nombreAsignado: string
): void {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadJsonFile(`equipo_${dispositivo.imei}_${stamp}.json`, {
    exportedAt: new Date().toISOString(),
    imei: dispositivo.imei,
    codigo: dispositivo.codigo ?? null,
    nombreAsignado,
    dispositivo,
  });
}
