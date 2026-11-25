/** Misma regla que server/lib/asignacionEquipo.js. IMEI repetido se guarda como CODIGO|IMEI. */

export function claveAsignacion(codigo: string | null | undefined, imei: string): string {
  const i = String(imei || '').trim();
  const c = String(codigo || '').trim().toUpperCase();
  if (!i) return '';
  return c ? `${c}|${i}` : i;
}

export function imeisDuplicados(
  dispositivos: Array<{ imei?: string | null }>
): Set<string> {
  const counts = new Map<string, number>();
  for (const d of dispositivos) {
    const imei = String(d?.imei || '').trim();
    if (!imei) continue;
    counts.set(imei, (counts.get(imei) || 0) + 1);
  }
  const out = new Set<string>();
  for (const [imei, n] of counts) {
    if (n > 1) out.add(imei);
  }
  return out;
}

export function tokenDeDispositivo(
  dispositivo: { codigo?: string | null; imei?: string | null },
  duplicados: Set<string>
): string {
  const imei = String(dispositivo?.imei || '').trim();
  if (!imei) return '';
  if (duplicados.has(imei)) return claveAsignacion(dispositivo?.codigo, imei);
  return imei;
}

export function tokenCubreDispositivo(
  token: string,
  dispositivo: { codigo?: string | null; imei?: string | null },
  duplicados: Set<string>
): boolean {
  const t = String(token || '').trim();
  const imei = String(dispositivo?.imei || '').trim();
  if (!t || !imei) return false;
  if (t === 'all') return true;
  if (t.includes('|')) return t.toUpperCase() === claveAsignacion(dispositivo?.codigo, imei);
  if (duplicados.has(imei)) return false;
  return t === imei;
}

export function accesoCubreDispositivo(
  tokens: string[],
  dispositivo: { codigo?: string | null; imei?: string | null },
  duplicados: Set<string>
): boolean {
  return tokens.some((token) => tokenCubreDispositivo(token, dispositivo, duplicados));
}
