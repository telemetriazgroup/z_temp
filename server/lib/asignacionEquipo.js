/**
 * Un IMEI puede existir en TUNEL, THERMOKING y STARCOOL a la vez.
 * No son el mismo equipo. Si el IMEI está repetido, la asignación guarda
 * CODIGO|IMEI. Si es único, sigue siendo el IMEI pelado (asignaciones viejas).
 */

export function claveAsignacion(codigo, imei) {
  const i = String(imei || '').trim();
  const c = String(codigo || '').trim().toUpperCase();
  if (!i) return '';
  return c ? `${c}|${i}` : i;
}

export function codigoDesdeRowKey(rowKey, imei) {
  const rk = String(rowKey || '');
  const i = String(imei || '').trim();
  if (!rk || !i || !rk.endsWith(`-${i}`)) return '';
  return rk.slice(0, -(i.length + 1));
}

export function imeisDuplicadosEn(dispositivos) {
  const counts = new Map();
  for (const d of dispositivos || []) {
    const imei = String(d?.imei || '').trim();
    if (!imei) continue;
    counts.set(imei, (counts.get(imei) || 0) + 1);
  }
  const out = new Set();
  for (const [imei, n] of counts) {
    if (n > 1) out.add(imei);
  }
  return out;
}

export function tokenDeDispositivo(dispositivo, duplicados) {
  const imei = String(dispositivo?.imei || '').trim();
  if (!imei) return '';
  if (duplicados && duplicados.has(imei)) return claveAsignacion(dispositivo?.codigo, imei);
  return imei;
}

/** token pelado no cubre un IMEI que está en más de una API. */
export function tokenCubreDispositivo(token, dispositivo, duplicados) {
  const t = String(token || '').trim();
  const imei = String(dispositivo?.imei || '').trim();
  if (!t || !imei) return false;
  if (t === 'all') return true;
  if (t.includes('|')) return t.toUpperCase() === claveAsignacion(dispositivo?.codigo, imei);
  if (duplicados && duplicados.has(imei)) return false;
  return t === imei;
}

export function dispositivoPermitido(dispositivo, allowed, duplicados) {
  for (const token of allowed || []) {
    if (tokenCubreDispositivo(token, dispositivo, duplicados)) return true;
  }
  return false;
}
