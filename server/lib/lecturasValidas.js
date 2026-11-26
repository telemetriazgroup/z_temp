/** USDA por debajo de −30 °C y evaporador por encima de 99 °C no son lectura: no se muestran ni alertan. */

export function numeroLectura(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function usdaValido(value) {
  const n = numeroLectura(value);
  if (n == null || n < -30) return null;
  return n;
}

export function evaporadorValido(value) {
  const n = numeroLectura(value);
  if (n == null || n > 99) return null;
  return n;
}
