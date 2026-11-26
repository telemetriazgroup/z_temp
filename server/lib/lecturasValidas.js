/** USDA por debajo de −30 °C no es lectura. Evaporador por encima de 99 °C o por debajo de −70 °C tampoco. La gráfica solo dibuja el evaporador desde −50 °C. */

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
  if (n == null || n > 99 || n < -70) return null;
  return n;
}

/** La gráfica no dibuja el evaporador por debajo de −50 °C. La tabla sí, hasta −70 °C. */
export function evaporadorParaGrafica(value) {
  const n = evaporadorValido(value);
  if (n == null || n < -50) return null;
  return n;
}
