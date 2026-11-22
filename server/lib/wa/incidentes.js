import fs from 'fs';
import path from 'path';
import { query } from '../db.js';
import { resolveUserEffectiveImeis } from '../gruposEquiposRepository.js';
import { ensureWaSchema } from './schema.js';
import { uid } from '../store.js';
import { contactosAprobadosPorUsernames } from './repository.js';
import { encolarTexto } from './outbox.js';
import { jidDeTelefono } from './telefono.js';

const DATA_DIR = process.env.CORREO_DATA_DIR ?? path.join(process.cwd(), 'data');
const FOTO_DIR = path.join(DATA_DIR, 'incidente-fotos');
const RECORDATORIO_MS = 6 * 60 * 60 * 1000;

export function puedeGestionarIncidentes(user) {
  if (!user) return false;
  if (user.superUser === true || user.category === 'superadmin') return true;
  return user.category === 'admin' && user.puedeIncidentes === true;
}

export function puedeIncidenteDeEquipo(user, imei) {
  if (!puedeGestionarIncidentes(user)) return false;
  const lista = resolveUserEffectiveImeis(user);
  if (lista == null) return true;
  return Boolean(imei) && lista.map(String).includes(String(imei));
}

export const TIPOS_INCIDENTE = [
  { id: 'sin_conexion', label: 'Sin conexión' },
  { id: 'averia_telemetria', label: 'Avería en telemetría' },
  { id: 'sin_2g', label: 'No hay cobertura de 2G' },
  { id: 'sin_4g', label: 'No hay cobertura de 4G' },
  { id: 'area_tecnica', label: 'Área técnica intervino' },
  { id: 'equipo_malogrado', label: 'Equipo malogrado' },
];

function tipoValido(id) {
  return TIPOS_INCIDENTE.some((t) => t.id === id);
}

function etiquetaTipo(id) {
  return TIPOS_INCIDENTE.find((t) => t.id === id)?.label || id;
}

function dirFotos() {
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  return FOTO_DIR;
}

function guardarFoto(incidenteId, dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > 700_000) return null;
  const id = uid('foto');
  const archivo = `${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
  fs.writeFileSync(path.join(dirFotos(), archivo), buf);
  return { id, archivo };
}

async function avisar(username, texto) {
  const contactos = await contactosAprobadosPorUsernames([username]);
  for (const c of contactos) {
    if (!c?.alertasHabilitadas || c.alertasPausadas) continue;
    const jid = jidDeTelefono(c.telefono);
    if (!jid) continue;
    encolarTexto(jid, texto, {
      esAlerta: true,
      contactoId: c.id,
      telefono: c.telefono,
      tipo: 'incidente',
    });
  }
}

function filaPublica(row, notas, fotos) {
  return {
    id: row.id,
    username: row.username,
    rowKey: row.row_key,
    imei: row.imei,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    tipoLabel: etiquetaTipo(row.tipo),
    descripcion: row.descripcion,
    estado: row.estado,
    solucion: row.solucion,
    creadoEn: row.creado_en,
    cerradoEn: row.cerrado_en,
    notas: notas.map((n) => ({
      id: n.id,
      texto: n.texto,
      username: n.username,
      creadoEn: n.creado_en,
      fotos: fotos.filter((f) => f.nota_id === n.id).map((f) => f.id),
    })),
    fotos: fotos.filter((f) => !f.nota_id).map((f) => f.id),
  };
}

async function cargarUno(id) {
  const inc = await query(`SELECT * FROM wa_incidente WHERE id = $1`, [id]);
  const row = inc.rows[0];
  if (!row) return null;
  const notas = await query(
    `SELECT * FROM wa_incidente_nota WHERE incidente_id = $1 ORDER BY creado_en ASC`,
    [id]
  );
  const fotos = await query(
    `SELECT id, nota_id FROM wa_incidente_foto WHERE incidente_id = $1 ORDER BY creado_en ASC`,
    [id]
  );
  return filaPublica(row, notas.rows, fotos.rows);
}

export async function imeiDeIncidente(id) {
  const r = await query(`SELECT imei, row_key FROM wa_incidente WHERE id = $1`, [id]);
  return r.rows[0]?.imei || String(r.rows[0]?.row_key || '').split('-').pop() || '';
}

export async function imeiDeFoto(fotoId) {
  const r = await query(
    `SELECT i.imei, i.row_key FROM wa_incidente_foto f
     JOIN wa_incidente i ON i.id = f.incidente_id WHERE f.id = $1`,
    [fotoId]
  );
  return r.rows[0]?.imei || String(r.rows[0]?.row_key || '').split('-').pop() || '';
}

export async function listarIncidentes(rowKey) {
  const r = await query(
    `SELECT * FROM wa_incidente WHERE row_key = $1 ORDER BY creado_en DESC LIMIT 30`,
    [rowKey]
  );
  const salida = [];
  for (const row of r.rows) {
    const notas = await query(
      `SELECT * FROM wa_incidente_nota WHERE incidente_id = $1 ORDER BY creado_en ASC`,
      [row.id]
    );
    const fotos = await query(
      `SELECT id, nota_id FROM wa_incidente_foto WHERE incidente_id = $1 ORDER BY creado_en ASC`,
      [row.id]
    );
    salida.push(filaPublica(row, notas.rows, fotos.rows));
  }
  return salida;
}

export async function abrirIncidente({ username, rowKey, imei, codigo, nombre, tipo, descripcion, fotos }) {
  if (!tipoValido(tipo)) throw new Error('Elige un tipo de incidente');
  const texto = String(descripcion || '').trim();
  if (texto.length < 4) throw new Error('La descripción de la falla es obligatoria');
  if (!rowKey) throw new Error('Falta el equipo');
  const id = uid('inc');
  await query(
    `INSERT INTO wa_incidente (id, username, row_key, imei, codigo, nombre, tipo, descripcion, estado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'seguimiento')`,
    [id, username, rowKey, imei || null, codigo || null, nombre || null, tipo, texto]
  );
  const lista = Array.isArray(fotos) ? fotos.slice(0, 6) : [];
  for (const foto of lista) {
    const guardada = guardarFoto(id, foto);
    if (!guardada) continue;
    await query(
      `INSERT INTO wa_incidente_foto (id, incidente_id, archivo) VALUES ($1,$2,$3)`,
      [guardada.id, id, guardada.archivo]
    );
  }
  await avisar(
    username,
    `ZTRACK · incidente en seguimiento\n${nombre || imei || rowKey}\n${etiquetaTipo(tipo)}\n${texto}\n\nTe voy a recordar por aquí para anotar el seguimiento o cerrarlo con la solución.`
  );
  return cargarUno(id);
}

export async function anotarIncidente({ id, username, texto, fotos }) {
  const nota = String(texto || '').trim();
  if (nota.length < 2) throw new Error('Escribe la actualización del seguimiento');
  const inc = await query(`SELECT * FROM wa_incidente WHERE id = $1`, [id]);
  const row = inc.rows[0];
  if (!row) throw new Error('No existe el incidente');
  if (row.estado !== 'seguimiento') throw new Error('El incidente ya está cerrado');
  const notaId = uid('nota');
  await query(
    `INSERT INTO wa_incidente_nota (id, incidente_id, username, texto) VALUES ($1,$2,$3,$4)`,
    [notaId, id, username, nota]
  );
  const lista = Array.isArray(fotos) ? fotos.slice(0, 6) : [];
  for (const foto of lista) {
    const guardada = guardarFoto(id, foto);
    if (!guardada) continue;
    await query(
      `INSERT INTO wa_incidente_foto (id, incidente_id, nota_id, archivo) VALUES ($1,$2,$3,$4)`,
      [guardada.id, id, notaId, guardada.archivo]
    );
  }
  await query(`UPDATE wa_incidente SET recordatorio_en = now() WHERE id = $1`, [id]);
  return cargarUno(id);
}

export async function cerrarIncidente({ id, username, solucion }) {
  const cierre = String(solucion || '').trim();
  if (cierre.length < 2) throw new Error('Escribe la solución o la observación de cierre');
  const inc = await query(`SELECT * FROM wa_incidente WHERE id = $1`, [id]);
  const row = inc.rows[0];
  if (!row) throw new Error('No existe el incidente');
  if (row.estado === 'cerrado') return cargarUno(id);
  await query(
    `UPDATE wa_incidente SET estado = 'cerrado', solucion = $2, cerrado_en = now() WHERE id = $1`,
    [id, cierre]
  );
  await avisar(
    username,
    `ZTRACK · incidente cerrado\n${row.nombre || row.imei}\n${etiquetaTipo(row.tipo)}\nCierre: ${cierre}`
  );
  return cargarUno(id);
}

export function archivoFoto(id) {
  return query(`SELECT archivo FROM wa_incidente_foto WHERE id = $1`, [id]).then((r) => {
    const nombre = r.rows[0]?.archivo;
    if (!nombre) return null;
    const full = path.join(FOTO_DIR, path.basename(nombre));
    if (!fs.existsSync(full)) return null;
    return full;
  });
}

export async function recordarIncidentes() {
  const listo = await ensureWaSchema();
  if (!listo) return 0;
  const r = await query(
    `SELECT * FROM wa_incidente
     WHERE estado = 'seguimiento'
       AND (
         (recordatorio_en IS NULL AND creado_en < now() - interval '6 hours')
         OR recordatorio_en < now() - interval '6 hours'
       )
     ORDER BY creado_en ASC
     LIMIT 20`
  );
  for (const row of r.rows) {
    await avisar(
      row.username,
      `ZTRACK · seguimiento pendiente\n${row.nombre || row.imei}\n${etiquetaTipo(row.tipo)}\nSigue abierto desde el alta. Anota la novedad en el listado o ciérralo con la solución.`
    );
    await query(`UPDATE wa_incidente SET recordatorio_en = now() WHERE id = $1`, [row.id]);
  }
  return r.rows.length;
}

export { RECORDATORIO_MS };
