import { TELEMETRY_TUNEL_TERMOKING_BASE } from './telemetryBases';

export type ComandoControlTunelTipo = 1 | 8 | 10;

export interface ComandoControlTunelResult {
  ok: boolean;
  raw: unknown;
}

function buildUrl(imei: string, tipo: ComandoControlTunelTipo, dato: number): string {
  const root =
    import.meta.env.VITE_TUNEL_COMANDO_CONTROL_BASE ??
    `${TELEMETRY_TUNEL_TERMOKING_BASE}/Tunel/comando_control_tunel`;
  return `${root}/${encodeURIComponent(imei)}?tipo=${tipo}&dato=${dato}`;
}

/** GET `{base}/Tunel/comando_control_tunel/{imei}?tipo=&dato=` */
export async function enviarComandoControlTunel(
  imei: string,
  tipo: ComandoControlTunelTipo,
  dato: number
): Promise<ComandoControlTunelResult> {
  const url = buildUrl(imei, tipo, dato);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Comando rechazado (HTTP ${res.status})`);
  }
  const ct = res.headers.get('content-type') ?? '';
  const raw = ct.includes('application/json') ? await res.json() : await res.text();
  return { ok: true, raw };
}
