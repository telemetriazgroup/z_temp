/** Cortes de una campaña en carpetas Drive: CLIENTE / MES_AÑO / SEMANA_n.

Las semanas van de lunes a domingo. El número de semana es del mes, no del año:
el día 1 cae en SEMANA_1 aunque el lunes haya sido del mes anterior. Si el rango
cruza de mes, cada lado va a su carpeta con solo los días de ese mes.
*/

const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SETIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

function parseDia(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) throw new Error('Use fechas AAAA-MM-DD');
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, month - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== d) {
    throw new Error('Fecha inválida');
  }
  return { y, m: month, d };
}

function cmp(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function iso(p) {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function addDays(p, n) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Lunes = 0 … domingo = 6. */
function lunesCero(p) {
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return (dow + 6) % 7;
}

/** Semana del mes en que cae el día. SEMANA_1 incluye los días previos al primer lunes. */
export function semanaDelMes(p) {
  const first = { y: p.y, m: p.m, d: 1 };
  return Math.floor((p.d - 1 + lunesCero(first)) / 7) + 1;
}

export function carpetaCliente(nombre) {
  const limpio = String(nombre ?? '')
    .trim()
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!limpio) throw new Error('Indique el cliente de la campaña');
  if (limpio.length > 80) throw new Error('El nombre del cliente es demasiado largo');
  return limpio;
}

/**
 * Parte un rango inclusivo en cortes de semana dentro de cada mes.
 * @returns {{ anio, mes, mesCarpeta, semana, semanaCarpeta, desde, hasta }[]}
 */
export function cortesCampaña(desde, hasta) {
  const inicio = parseDia(desde);
  const fin = parseDia(hasta);
  if (cmp(inicio, fin) > 0) throw new Error('La fecha inicial es posterior a la final');

  const cortes = [];
  let cur = inicio;
  let guard = 0;
  while (cmp(cur, fin) <= 0) {
    if (++guard > 400) throw new Error('El rango supera 400 días');
    const semana = semanaDelMes(cur);
    const start = cur;
    let end = cur;
    let next = addDays(cur, 1);
    while (
      cmp(next, fin) <= 0 &&
      next.y === start.y &&
      next.m === start.m &&
      semanaDelMes(next) === semana
    ) {
      end = next;
      next = addDays(next, 1);
    }
    cortes.push({
      anio: start.y,
      mes: start.m,
      mesCarpeta: `${MESES[start.m - 1]}_${start.y}`,
      semana,
      semanaCarpeta: `SEMANA_${semana}`,
      desde: iso(start),
      hasta: iso(end),
    });
    cur = next;
  }
  return cortes;
}

export function planCarpetas(cliente, desde, hasta) {
  const nombre = carpetaCliente(cliente);
  return cortesCampaña(desde, hasta).map((corte) => ({
    ...corte,
    cliente: nombre,
    ruta: `${nombre}/${corte.mesCarpeta}/${corte.semanaCarpeta}`,
  }));
}
