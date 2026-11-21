import { readJson, writeJson } from './store.js';

const FILE = 'apiAsistencia.json';
const DEFAULT_EMAIL = 'ztrack@zgroup.com.pe';

function normalizar(lista) {
  const out = [];
  const seen = new Set();
  for (const raw of lista ?? []) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Destinatarios del aviso de API sin conexión. Si no hay lista, queda ztrack. */
export function getApiAsistenciaEmails() {
  const saved = readJson(FILE, null);
  const list = normalizar(saved?.emails);
  return list.length > 0 ? list : [DEFAULT_EMAIL];
}

export function saveApiAsistenciaEmails(emails) {
  const list = normalizar(emails);
  const saved = {
    emails: list.length > 0 ? list : [DEFAULT_EMAIL],
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, saved);
  return saved;
}
