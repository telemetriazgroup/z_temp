/** Deja el teléfono en dígitos, con prefijo 51 si viene un móvil peruano de 9 dígitos. */
export function normalizarTelefono(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`;
  return digits;
}

export function jidDeTelefono(telefono) {
  const n = normalizarTelefono(telefono);
  if (!n) return null;
  return `${n}@c.us`;
}

export function telefonoDeJid(jid) {
  const raw = String(jid ?? '').split('@')[0].replace(/\D/g, '');
  return normalizarTelefono(raw);
}
