const VENTANA_MS = 60_000;
const LIMITE_GENERAL = 120;
const LIMITE_HISTORIAL = 30;
const cubetas = new Map();

function ipv4AEntero(ip) {
  const partes = String(ip || '').split('.');
  if (partes.length !== 4) return null;
  let n = 0;
  for (const parte of partes) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const valor = Number(parte);
    if (valor > 255) return null;
    n = ((n << 8) + valor) >>> 0;
  }
  return n;
}

export function ipCliente(req) {
  const remoto = String(req.socket?.remoteAddress || req.ip || '');
  const loopback =
    remoto === '127.0.0.1' ||
    remoto === '::1' ||
    remoto.endsWith('127.0.0.1');
  if (loopback) {
    const reenviada = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (reenviada) return reenviada.replace(/^::ffff:/, '');
  }
  return remoto.replace(/^::ffff:/, '');
}

export function ipPermitida(ip, reglas) {
  const lista = Array.isArray(reglas) ? reglas : [];
  if (lista.length === 0) return true;
  const limpia = String(ip || '').replace(/^::ffff:/, '');
  for (const regla of lista) {
    const texto = String(regla || '').trim();
    if (!texto) continue;
    if (!texto.includes('/')) {
      if (limpia === texto) return true;
      continue;
    }
    const [base, bitsTexto] = texto.split('/');
    const bits = Number(bitsTexto);
    const actual = ipv4AEntero(limpia);
    const red = ipv4AEntero(base);
    if (actual == null || red == null || bits < 0 || bits > 32) continue;
    const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((actual & mascara) === (red & mascara)) return true;
  }
  return false;
}

function tomarCupo(id, limite) {
  const ahora = Date.now();
  const previos = cubetas.get(id) ?? [];
  const vivos = previos.filter((t) => ahora - t < VENTANA_MS);
  if (vivos.length >= limite) {
    cubetas.set(id, vivos);
    const espera = Math.max(1, Math.ceil((VENTANA_MS - (ahora - vivos[0])) / 1000));
    return { ok: false, espera };
  }
  vivos.push(ahora);
  cubetas.set(id, vivos);
  return { ok: true };
}

export function cupoSolicitud(userId, { historial = false } = {}) {
  const general = tomarCupo(`g:${userId}`, LIMITE_GENERAL);
  if (!general.ok) return general;
  if (!historial) return { ok: true };
  return tomarCupo(`h:${userId}`, LIMITE_HISTORIAL);
}

export function claveDesdeSolicitud(req) {
  const autorizacion = String(req.headers.authorization || '').trim();
  if (/^bearer\s+/i.test(autorizacion)) {
    return autorizacion.replace(/^bearer\s+/i, '').trim();
  }
  const header = String(req.headers['x-api-key'] || '').trim();
  if (header) return header;
  return '';
}
