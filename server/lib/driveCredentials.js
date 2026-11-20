import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './store.js';

const FILE = 'drive-service-account.json';
const META = 'drive-service-account.meta.json';
const DATA_DIR = process.env.CORREO_DATA_DIR ?? path.join(process.cwd(), 'data');

function isServiceAccount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const email = typeof value.client_email === 'string' ? value.client_email.trim() : '';
  const key = typeof value.private_key === 'string' ? value.private_key : '';
  const project = typeof value.project_id === 'string' ? value.project_id.trim() : '';
  return (
    value.type === 'service_account' &&
    email.endsWith('.iam.gserviceaccount.com') &&
    key.includes('BEGIN PRIVATE KEY') &&
    project.length > 0
  );
}

function removeFile(name) {
  const fp = path.join(DATA_DIR, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

export function folderIdFromUrl(value) {
  const s = String(value ?? '').trim();
  const fromPath = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

function metaOf() {
  const meta = readJson(META, {});
  return meta && typeof meta === 'object' ? meta : {};
}

function folderFields(meta) {
  const folderId = typeof meta?.folderId === 'string' && meta.folderId ? meta.folderId : null;
  return {
    folderId,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
  };
}

/** Vista sin la clave privada. */
export function drivePublicView() {
  const raw = readJson(FILE, null);
  const meta = metaOf();
  if (!isServiceAccount(raw)) {
    return {
      configured: false,
      clientEmail: null,
      projectId: null,
      updatedAt: null,
      ...folderFields(meta),
    };
  }
  return {
    configured: true,
    clientEmail: raw.client_email.trim(),
    projectId: raw.project_id.trim(),
    updatedAt: meta?.updatedAt ?? null,
    ...folderFields(meta),
  };
}

export function saveDriveServiceAccount(input) {
  const creds = input?.type === 'service_account' ? input : input?.credentials;
  if (!isServiceAccount(creds)) {
    throw new Error('El archivo no es una clave JSON de cuenta de servicio de Google');
  }
  const keep = [
    'type',
    'project_id',
    'private_key_id',
    'private_key',
    'client_email',
    'client_id',
    'auth_uri',
    'token_uri',
    'auth_provider_x509_cert_url',
    'client_x509_cert_url',
    'universe_domain',
  ];
  const clean = {};
  for (const key of keep) {
    if (creds[key] != null && creds[key] !== '') clean[key] = creds[key];
  }
  clean.project_id = String(clean.project_id).trim();
  clean.client_email = String(clean.client_email).trim();
  writeJson(FILE, clean);
  writeJson(META, { ...metaOf(), updatedAt: new Date().toISOString() });
  console.log(`[drive] cuenta de servicio guardada: ${clean.client_email}`);
  return drivePublicView();
}

export function saveDriveFolder(input) {
  const folderId = folderIdFromUrl(input?.url ?? input?.folderId ?? input);
  if (!folderId) throw new Error('El enlace no es una carpeta de Drive');
  writeJson(META, { ...metaOf(), folderId, folderUpdatedAt: new Date().toISOString() });
  console.log(`[drive] carpeta general: ${folderId}`);
  return drivePublicView();
}

export function clearDriveServiceAccount() {
  removeFile(FILE);
  removeFile(META);
  return drivePublicView();
}
