import { readJson, writeJson } from '../store.js';
import { normalizarTelefono } from './telefono.js';

const FILE = 'waAjustes.json';
const MIN_SEG = 1;
const MAX_SEG = 10;
const DEF_SEG = 2;

function acotar(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return DEF_SEG;
  return Math.min(MAX_SEG, Math.max(MIN_SEG, Math.round(n)));
}

export function leerAjustesWa() {
  const raw = readJson(FILE, {});
  const pedido = raw?.gapChatSeg;
  const gapChatSeg = pedido == null || pedido === '' ? DEF_SEG : acotar(pedido);
  const telefonoDesarrollo = normalizarTelefono(raw?.telefonoDesarrollo || '');
  return { gapChatSeg, minSeg: MIN_SEG, maxSeg: MAX_SEG, telefonoDesarrollo };
}

export function guardarGapChatSeg(seg) {
  const n = Number(seg);
  if (!Number.isFinite(n) || n < MIN_SEG || n > MAX_SEG) {
    throw new Error(`La espera debe estar entre ${MIN_SEG} y ${MAX_SEG} segundos`);
  }
  const actual = readJson(FILE, {});
  const gapChatSeg = Math.round(n);
  writeJson(FILE, { ...actual, gapChatSeg });
  return leerAjustesWa();
}

export function guardarTelefonoDesarrollo(valor) {
  const texto = String(valor ?? '').trim();
  const telefonoDesarrollo = texto ? normalizarTelefono(texto) : '';
  if (texto && telefonoDesarrollo.length < 8) {
    throw new Error('El número interno necesita prefijo de país, por ejemplo 51987654321.');
  }
  const actual = readJson(FILE, {});
  writeJson(FILE, { ...actual, telefonoDesarrollo });
  return leerAjustesWa();
}

export function gapChatMs() {
  return leerAjustesWa().gapChatSeg * 1000;
}
