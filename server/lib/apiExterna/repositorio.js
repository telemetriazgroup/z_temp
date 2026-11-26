import crypto from 'crypto';
import { readJson, writeJson, uid } from '../store.js';

const FILE = 'apiExterna.json';
const MAX_IPS = 20;
const MAX_EQUIPOS_DEMO = 40;

function vacio() {
  return { cuentas: {}, demos: [] };
}

function leer() {
  const raw = readJson(FILE, vacio());
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return vacio();
  if (raw.cuentas == null || typeof raw.cuentas !== 'object') raw.cuentas = {};
  if (!Array.isArray(raw.demos)) raw.demos = [];
  return raw;
}

function guardar(data) {
  writeJson(FILE, data);
}

export function hashClave(clave) {
  return crypto.createHash('sha256').update(String(clave)).digest('hex');
}

function nuevaClave() {
  const clave = `ztk_${crypto.randomBytes(32).toString('base64url')}`;
  return { clave, keyHash: hashClave(clave), prefix: clave.slice(0, 12) };
}

export function vistaPublica(cuenta) {
  if (!cuenta) {
    return {
      enabled: false,
      prefix: null,
      allowIps: [],
      createdAt: null,
      updatedAt: null,
      lastUsedAt: null,
      requestCount: 0,
    };
  }
  return {
    enabled: cuenta.enabled === true && Boolean(cuenta.keyHash),
    prefix: cuenta.prefix ?? null,
    allowIps: Array.isArray(cuenta.allowIps) ? cuenta.allowIps : [],
    createdAt: cuenta.createdAt ?? null,
    updatedAt: cuenta.updatedAt ?? null,
    lastUsedAt: cuenta.lastUsedAt ?? null,
    requestCount: Number(cuenta.requestCount) || 0,
  };
}

export function leerCuenta(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  return leer().cuentas[id] ?? null;
}

export function buscarPorClave(clave) {
  const raw = String(clave || '').trim();
  if (!raw.startsWith('ztk_') || raw.length < 20) return null;
  const hash = hashClave(raw);
  const data = leer();
  for (const [userId, cuenta] of Object.entries(data.cuentas)) {
    if (cuenta?.keyHash === hash) return { tipo: 'cuenta', id: userId, cuenta };
  }
  for (const demo of data.demos) {
    if (demo?.keyHash === hash) return { tipo: 'demo', id: demo.id, demo };
  }
  return null;
}

export function calcularVencimiento(valor, unidad, desde = new Date()) {
  const n = Math.floor(Number(valor));
  if (!Number.isFinite(n)) throw new Error('Indique la duración');
  if (unidad === 'horas') {
    if (n < 1 || n > 168) throw new Error('Las horas van de 1 a 168');
    return new Date(desde.getTime() + n * 60 * 60 * 1000);
  }
  if (unidad === 'dias') {
    if (n < 1 || n > 30) throw new Error('Los días van de 1 a 30');
    return new Date(desde.getTime() + n * 24 * 60 * 60 * 1000);
  }
  throw new Error('La duración es en horas o días');
}

export function estadoDemo(demo, ahora = new Date()) {
  if (!demo || demo.revocada === true || !demo.keyHash) return 'revocada';
  const vence = new Date(demo.venceEn).getTime();
  if (!Number.isFinite(vence) || vence <= ahora.getTime()) return 'vencida';
  return 'vigente';
}

export function vistaDemo(demo, ahora = new Date()) {
  if (!demo) return null;
  return {
    id: demo.id,
    nombre: demo.nombre,
    motivo: demo.motivo,
    prefix: demo.prefix ?? null,
    equipos: Array.isArray(demo.equipos) ? demo.equipos : [],
    duracionValor: demo.duracionValor,
    duracionUnidad: demo.duracionUnidad,
    createdAt: demo.createdAt ?? null,
    venceEn: demo.venceEn ?? null,
    estado: estadoDemo(demo, ahora),
    lastUsedAt: demo.lastUsedAt ?? null,
    requestCount: Number(demo.requestCount) || 0,
  };
}

export function listarDemos() {
  return leer()
    .demos.map((demo) => vistaDemo(demo))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function normalizarEquiposDemo(lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('Elija al menos un equipo');
  }
  const vistos = new Set();
  const equipos = [];
  for (const item of lista) {
    const origen = String(item?.origen || item?.codigo || '')
      .trim()
      .toUpperCase();
    const canonico =
      origen === 'THERMOKING' ? 'TERMOKING' : origen;
    const imei = String(item?.imei || '').trim();
    if (!['TUNEL', 'TERMOKING', 'STARCOOL', 'STARCOOL2'].includes(canonico)) {
      throw new Error('Origen de equipo no válido');
    }
    if (!/^\d{10,20}$/.test(imei)) throw new Error(`IMEI no válido: ${imei || 'vacío'}`);
    const clave = `${canonico}|${imei}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    equipos.push({ origen: canonico, imei });
  }
  if (equipos.length === 0) throw new Error('Elija al menos un equipo');
  if (equipos.length > MAX_EQUIPOS_DEMO) {
    throw new Error(`Una demo admite hasta ${MAX_EQUIPOS_DEMO} equipos`);
  }
  return equipos;
}

export function crearDemo({ nombre, motivo, duracionValor, duracionUnidad, equipos }) {
  const titulo = String(nombre || '').trim();
  if (titulo.length < 2 || titulo.length > 80) {
    throw new Error('El nombre debe tener entre 2 y 80 caracteres');
  }
  const uso = motivo === 'desarrollo' ? 'desarrollo' : motivo === 'cliente' ? 'cliente' : '';
  if (!uso) throw new Error('Indique si es prueba de cliente o de desarrollo');
  const ahora = new Date();
  const vence = calcularVencimiento(duracionValor, duracionUnidad, ahora);
  const lista = normalizarEquiposDemo(equipos);
  const { clave, keyHash, prefix } = nuevaClave();
  const demo = {
    id: uid('demo'),
    nombre: titulo,
    motivo: uso,
    keyHash,
    prefix,
    equipos: lista,
    duracionValor: Math.floor(Number(duracionValor)),
    duracionUnidad,
    createdAt: ahora.toISOString(),
    venceEn: vence.toISOString(),
    revocada: false,
    lastUsedAt: null,
    requestCount: 0,
  };
  const data = leer();
  data.demos.unshift(demo);
  guardar(data);
  return { clave, demo: vistaDemo(demo, ahora) };
}

export function revocarDemo(id) {
  const data = leer();
  const demo = data.demos.find((d) => d.id === id);
  if (!demo) throw new Error('La conexión demo no existe');
  demo.revocada = true;
  demo.keyHash = null;
  demo.updatedAt = new Date().toISOString();
  guardar(data);
  return vistaDemo(demo);
}

function escribirCuenta(userId, cuenta) {
  const data = leer();
  data.cuentas[userId] = cuenta;
  guardar(data);
  return cuenta;
}

export function habilitarCuenta(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('Cuenta inválida');
  const previa = leerCuenta(id);
  if (previa?.enabled === true && previa.keyHash) {
    throw new Error('La cuenta ya tiene la API habilitada. Rote la clave si necesita otra.');
  }
  const ahora = new Date().toISOString();
  const { clave, keyHash, prefix } = nuevaClave();
  const cuenta = {
    enabled: true,
    keyHash,
    prefix,
    allowIps: Array.isArray(previa?.allowIps) ? previa.allowIps : [],
    createdAt: previa?.createdAt ?? ahora,
    updatedAt: ahora,
    lastUsedAt: previa?.lastUsedAt ?? null,
    requestCount: Number(previa?.requestCount) || 0,
  };
  escribirCuenta(id, cuenta);
  return { clave, cuenta: vistaPublica(cuenta) };
}

export function rotarClave(userId) {
  const id = String(userId || '').trim();
  const previa = leerCuenta(id);
  if (!previa?.enabled || !previa.keyHash) {
    throw new Error('La cuenta no tiene la API habilitada');
  }
  const ahora = new Date().toISOString();
  const { clave, keyHash, prefix } = nuevaClave();
  const cuenta = {
    ...previa,
    enabled: true,
    keyHash,
    prefix,
    updatedAt: ahora,
  };
  escribirCuenta(id, cuenta);
  return { clave, cuenta: vistaPublica(cuenta) };
}

export function revocarCuenta(userId) {
  const id = String(userId || '').trim();
  const previa = leerCuenta(id);
  if (!previa) return vistaPublica(null);
  const cuenta = {
    ...previa,
    enabled: false,
    keyHash: null,
    updatedAt: new Date().toISOString(),
  };
  escribirCuenta(id, cuenta);
  return vistaPublica(cuenta);
}

export function normalizarIps(lista) {
  const partes = Array.isArray(lista)
    ? lista
    : String(lista ?? '')
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const unicas = [...new Set(partes)];
  if (unicas.length > MAX_IPS) {
    throw new Error(`Máximo ${MAX_IPS} direcciones`);
  }
  for (const regla of unicas) {
    if (!esReglaIp(regla)) {
      throw new Error(`Dirección no válida: ${regla}`);
    }
  }
  return unicas;
}

function esReglaIp(regla) {
  const [base, bits] = String(regla).split('/');
  if (!ipv4Valida(base)) return false;
  if (bits == null) return true;
  if (!/^\d{1,2}$/.test(bits)) return false;
  const n = Number(bits);
  return n >= 0 && n <= 32;
}

function ipv4Valida(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return false;
  return p.every((parte) => /^\d{1,3}$/.test(parte) && Number(parte) <= 255);
}

export function guardarIps(userId, lista) {
  const id = String(userId || '').trim();
  const previa = leerCuenta(id);
  if (!previa) throw new Error('Habilite la cuenta antes de restringir direcciones');
  const allowIps = normalizarIps(lista);
  const cuenta = { ...previa, allowIps, updatedAt: new Date().toISOString() };
  escribirCuenta(id, cuenta);
  return vistaPublica(cuenta);
}

const usoPendiente = new Map();

/** Anota el uso y reescribe el archivo como mucho una vez por minuto. */
export function marcarUso(tipo, id) {
  const clave = `${tipo}:${id}`;
  const ahora = Date.now();
  const previo = usoPendiente.get(clave) ?? { count: 0, flushedAt: 0 };
  const count = previo.count + 1;
  if (ahora - previo.flushedAt < 60_000) {
    usoPendiente.set(clave, { count, flushedAt: previo.flushedAt });
    return;
  }
  const data = leer();
  const registro =
    tipo === 'demo'
      ? data.demos.find((d) => d.id === id)
      : data.cuentas[id];
  if (!registro) {
    usoPendiente.set(clave, { count, flushedAt: previo.flushedAt });
    return;
  }
  registro.requestCount = (Number(registro.requestCount) || 0) + count;
  registro.lastUsedAt = new Date(ahora).toISOString();
  guardar(data);
  usoPendiente.set(clave, { count: 0, flushedAt: ahora });
}
