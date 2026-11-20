import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { planCarpetas } from './cortesCampaña.js';

const DATA_DIR = process.env.CORREO_DATA_DIR ?? path.join(process.cwd(), 'data');

function driveClient() {
  const keyFile = path.join(DATA_DIR, 'drive-service-account.json');
  if (!fs.existsSync(keyFile)) throw new Error('No hay cuenta de servicio de Drive');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function carpetasHijas(drive, parentId) {
  const parent = await drive.files.get({
    fileId: parentId,
    fields: 'id, driveId',
    supportsAllDrives: true,
  });
  const driveId = parent.data.driveId || undefined;
  const files = [];
  let pageToken;
  do {
    const listed = await drive.files.list({
      q: [
        "mimeType = 'application/vnd.google-apps.folder'",
        'trashed = false',
        `'${parentId}' in parents`,
      ].join(' and '),
      fields: 'nextPageToken, files(id, name, webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: driveId ? 'drive' : 'allDrives',
      ...(driveId ? { driveId } : {}),
      pageSize: 100,
      pageToken,
    });
    files.push(...(listed.data.files ?? []));
    pageToken = listed.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

async function asegurarCarpeta(drive, parentId, name) {
  const hijas = await carpetasHijas(drive, parentId);
  const found = hijas.find((f) => f.name === name);
  if (found) return { ...found, existia: true };
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: 'id, name, webViewLink',
  });
  return { ...created.data, existia: false };
}

export async function archivarEnDrive(fileId) {
  if (!fileId) return;
  const drive = driveClient();
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
}

export async function subirPdf(parentId, filePath, nombre) {
  const drive = driveClient();
  const created = await drive.files.create({
    requestBody: {
      name: nombre,
      parents: [parentId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: createReadStream(filePath),
    },
    supportsAllDrives: true,
    fields: 'id, name, webViewLink',
  });
  return created.data;
}

/** Crea, si faltan, CLIENTE / MES_AÑO / SEMANA_n bajo la carpeta general. */
export async function crearCarpetasCampaña({ cliente, desde, hasta, rootId }) {
  if (!rootId) throw new Error('Falta la carpeta general de Drive');
  const plan = planCarpetas(cliente, desde, hasta);
  const drive = driveClient();
  const cache = new Map();
  async function en(parentId, name) {
    const key = `${parentId}/${name}`;
    if (cache.has(key)) return cache.get(key);
    const folder = await asegurarCarpeta(drive, parentId, name);
    cache.set(key, folder);
    return folder;
  }
  const clienteFolder = await en(rootId, plan[0].cliente);
  const cortes = [];
  for (const corte of plan) {
    const mes = await en(clienteFolder.id, corte.mesCarpeta);
    const semana = await en(mes.id, corte.semanaCarpeta);
    cortes.push({
      ...corte,
      carpetaId: semana.id,
      carpetaUrl: semana.webViewLink || `https://drive.google.com/drive/folders/${semana.id}`,
      existia: Boolean(semana.existia),
    });
  }
  return {
    cliente: plan[0].cliente,
    clienteCarpetaId: clienteFolder.id,
    clienteCarpetaUrl:
      clienteFolder.webViewLink || `https://drive.google.com/drive/folders/${clienteFolder.id}`,
    cortes,
  };
}
