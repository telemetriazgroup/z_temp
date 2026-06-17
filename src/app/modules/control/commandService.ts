import type { DispositivoOrigenCodigo } from '../../types';
import type { User } from '../../types';
import {
  enviarComandoControlTunel,
  type ComandoControlTunelResult,
  type ComandoControlTunelTipo,
} from '../../api/comandoControlTunel';
import { logControlCommand } from './commandLogRepository';
import type { ControlComandoCambio, ControlEquipoSnapshot } from './commandSnapshot';

export interface EjecutarComandoTunelParams {
  user: User;
  imei: string;
  codigo?: DispositivoOrigenCodigo | null;
  tipo: ComandoControlTunelTipo;
  dato: number;
  label: string;
  estadoAnterior?: ControlEquipoSnapshot | null;
  cambios?: ControlComandoCambio[];
}

/**
 * Envía comando al túnel y registra auditoría con la cuenta que lo ejecutó.
 */
export async function ejecutarComandoTunel(
  params: EjecutarComandoTunelParams
): Promise<ComandoControlTunelResult> {
  const { user, imei, codigo = null, tipo, dato, label, estadoAnterior = null, cambios = [] } =
    params;
  try {
    const result = await enviarComandoControlTunel(imei, tipo, dato);
    logControlCommand({
      user,
      imei,
      codigo,
      tipo,
      dato,
      label,
      success: true,
      raw: result.raw,
      estadoAnterior,
      cambios,
    });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error al enviar comando';
    logControlCommand({
      user,
      imei,
      codigo,
      tipo,
      dato,
      label,
      success: false,
      error: message,
      estadoAnterior,
      cambios,
    });
    throw e;
  }
}

export function labelComandoTemperatura(dato: number): string {
  return `Temperatura ${dato} °C`;
}

export function labelComandoDefrost(): string {
  return 'Defrost';
}

export function labelComandoStopPlan(minutos: number, segundos: number): string {
  return `Stop plan ${minutos} min (${segundos} s)`;
}
