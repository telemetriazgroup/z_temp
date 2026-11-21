import { query } from '../db.js';
import { normalizarTelefono } from './telefono.js';
import { TIEMPOS_WA } from './tiempos.js';

function mapContacto(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono,
    activo: row.activo === true,
    alertasHabilitadas: row.alertas_habilitadas === true,
    pruebaIniciadaEn: row.prueba_iniciada_en,
    pruebaRespuestas: row.prueba_respuestas ?? 0,
    pruebaRequeridas: row.prueba_requeridas ?? TIEMPOS_WA.respuestasRequeridas,
    aprobadoEn: row.aprobado_en,
    creadoEn: row.creado_en,
    username: row.username ?? null,
    alertasPausadas: row.alertas_pausadas === true,
  };
}

export async function listarContactos() {
  const r = await query(
    `SELECT * FROM wa_contacto ORDER BY nombre`
  );
  const contactos = r.rows.map(mapContacto);
  if (!contactos.length) return [];
  const a = await query(
    `SELECT contacto_id, row_key, imei, codigo, nombre
     FROM wa_asignacion ORDER BY codigo, imei`
  );
  const por = new Map();
  for (const row of a.rows) {
    if (!por.has(row.contacto_id)) por.set(row.contacto_id, []);
    por.get(row.contacto_id).push({
      rowKey: row.row_key,
      imei: row.imei,
      codigo: row.codigo,
      nombre: row.nombre,
    });
  }
  return contactos.map((c) => ({ ...c, equipos: por.get(c.id) ?? [] }));
}

export async function obtenerContactoPorTelefono(telefono) {
  const n = normalizarTelefono(telefono);
  if (!n) return null;
  const r = await query(`SELECT * FROM wa_contacto WHERE telefono = $1`, [n]);
  return mapContacto(r.rows[0]);
}

export async function obtenerContacto(id) {
  const r = await query(`SELECT * FROM wa_contacto WHERE id = $1`, [id]);
  return mapContacto(r.rows[0]);
}

export async function guardarContacto({ id, nombre, telefono, activo = true }) {
  const n = normalizarTelefono(telefono);
  if (!nombre?.trim()) throw new Error('El nombre es obligatorio');
  if (n.length < 11) throw new Error('Teléfono inválido. Use 51987654321');
  if (id) {
    const r = await query(
      `UPDATE wa_contacto
       SET nombre = $2, telefono = $3, activo = $4
       WHERE id = $1 RETURNING *`,
      [id, nombre.trim(), n, activo !== false]
    );
    if (!r.rows[0]) throw new Error('Contacto no encontrado');
    return mapContacto(r.rows[0]);
  }
  const r = await query(
    `INSERT INTO wa_contacto (nombre, telefono, activo, prueba_requeridas)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [nombre.trim(), n, activo !== false, TIEMPOS_WA.respuestasRequeridas]
  );
  return mapContacto(r.rows[0]);
}

export async function eliminarContacto(id) {
  await query(`DELETE FROM wa_contacto WHERE id = $1`, [id]);
}

export async function reemplazarAsignaciones(contactoId, equipos) {
  await query(`DELETE FROM wa_asignacion WHERE contacto_id = $1`, [contactoId]);
  for (const e of equipos ?? []) {
    if (!e?.imei || !e?.rowKey) continue;
    await query(
      `INSERT INTO wa_asignacion (contacto_id, row_key, imei, codigo, nombre)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contacto_id, row_key) DO UPDATE SET
         nombre = EXCLUDED.nombre, codigo = EXCLUDED.codigo`,
      [contactoId, e.rowKey, String(e.imei), e.codigo ?? null, e.nombre ?? null]
    );
  }
  return listarAsignaciones(contactoId);
}

export async function listarAsignaciones(contactoId) {
  const r = await query(
    `SELECT row_key, imei, codigo, nombre FROM wa_asignacion
     WHERE contacto_id = $1 ORDER BY codigo, imei`,
    [contactoId]
  );
  return r.rows.map((row) => ({
    rowKey: row.row_key,
    imei: row.imei,
    codigo: row.codigo,
    nombre: row.nombre,
  }));
}

export async function contactosParaAlerta(rowKey) {
  const r = await query(
    `SELECT c.* FROM wa_contacto c
     JOIN wa_asignacion a ON a.contacto_id = c.id
     WHERE a.row_key = $1
       AND c.activo = true
       AND c.alertas_habilitadas = true
       AND c.alertas_pausadas = false
       AND NOT EXISTS (
         SELECT 1 FROM wa_silencio s
         WHERE s.contacto_id = c.id AND s.row_key = $1
       )`,
    [rowKey]
  );
  return r.rows.map(mapContacto);
}

export async function iniciarPrueba(id) {
  const r = await query(
    `UPDATE wa_contacto SET
       prueba_iniciada_en = now(),
       prueba_respuestas = 0,
       prueba_requeridas = $2,
       alertas_habilitadas = false,
       aprobado_en = NULL
     WHERE id = $1 RETURNING *`,
    [id, TIEMPOS_WA.respuestasRequeridas]
  );
  return mapContacto(r.rows[0]);
}

export async function registrarRespuestaPrueba(id) {
  const req = TIEMPOS_WA.respuestasRequeridas;
  const r = await query(
    `UPDATE wa_contacto SET
       prueba_respuestas = prueba_respuestas + 1,
       alertas_habilitadas = (prueba_respuestas + 1) >= $2,
       aprobado_en = CASE WHEN (prueba_respuestas + 1) >= $2 THEN now() ELSE aprobado_en END
     WHERE id = $1 RETURNING *`,
    [id, req]
  );
  return mapContacto(r.rows[0]);
}

export async function aprobarManual(id) {
  const r = await query(
    `UPDATE wa_contacto SET
       alertas_habilitadas = true,
       aprobado_en = now(),
       prueba_respuestas = GREATEST(prueba_respuestas, prueba_requeridas)
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return mapContacto(r.rows[0]);
}

export async function revocar(id) {
  const r = await query(
    `UPDATE wa_contacto SET
       alertas_habilitadas = false,
       aprobado_en = NULL,
       prueba_respuestas = 0,
       prueba_iniciada_en = NULL
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return mapContacto(r.rows[0]);
}

export async function registrarEvento(contactoId, tipo, detalle) {
  await query(
    `INSERT INTO wa_evento (contacto_id, tipo, detalle) VALUES ($1, $2, $3)`,
    [contactoId, tipo, detalle ?? null]
  );
}

export async function reasignarTelefono(desde, hacia) {
  const origen = normalizarTelefono(desde);
  const destino = normalizarTelefono(hacia);
  if (!origen || !destino || origen === destino) return 0;
  const r = await query(`UPDATE wa_mensaje SET telefono = $1 WHERE telefono = $2`, [destino, origen]);
  return r.rowCount || 0;
}

export async function registrarMensaje({ contactoId, telefono, direccion, texto, tipo }) {
  await query(
    `INSERT INTO wa_mensaje (contacto_id, telefono, direccion, texto, tipo)
     VALUES ($1, $2, $3, $4, $5)`,
    [contactoId ?? null, normalizarTelefono(telefono), direccion, texto, tipo ?? null]
  );
}

export async function listarMensajes({ telefono, desde, hasta, limit = 100 } = {}) {
  const params = [];
  const where = [];
  if (telefono) {
    params.push(normalizarTelefono(telefono));
    where.push(`telefono = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    where.push(`creado_en >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`creado_en <= $${params.length}`);
  }
  const tope = Math.min(Number(limit) || 100, desde || hasta ? 1000 : 100);
  params.push(tope);
  const r = await query(
    `SELECT id, contacto_id, telefono, direccion, texto, tipo, creado_en
     FROM wa_mensaje
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY creado_en DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

export async function listarChats() {
  const r = await query(
    `SELECT telefono,
            COUNT(*)::int AS total,
            MAX(creado_en) AS ultimo_en,
            (ARRAY_AGG(texto ORDER BY creado_en DESC))[1] AS ultimo_texto,
            (ARRAY_AGG(direccion ORDER BY creado_en DESC))[1] AS ultima_direccion
     FROM wa_mensaje
     GROUP BY telefono
     ORDER BY MAX(creado_en) DESC`
  );
  return r.rows;
}

export async function contactoPorUsername(username) {
  const r = await query(`SELECT * FROM wa_contacto WHERE lower(username) = lower($1)`, [
    String(username || '').trim(),
  ]);
  return mapContacto(r.rows[0]);
}

export async function vincularNumeroDeUsuario({ username, nombre, telefono }) {
  const user = String(username || '').trim();
  const n = normalizarTelefono(telefono);
  const actual = await contactoPorUsername(user);
  if (!n) {
    if (actual) {
      await query(`UPDATE wa_contacto SET username = NULL WHERE id = $1`, [actual.id]);
    }
    return null;
  }
  if (n.length < 11) throw new Error('El número de WhatsApp debe incluir el prefijo 51 y 9 dígitos');
  const ocupado = await obtenerContactoPorTelefono(n);
  if (ocupado && ocupado.username && ocupado.username.toLowerCase() !== user.toLowerCase()) {
    throw new Error('Ese número ya está registrado en otra cuenta');
  }
  if (actual) {
    const mismo = actual.telefono === n;
    const r = await query(
      `UPDATE wa_contacto SET
         nombre = $2,
         telefono = $3,
         alertas_habilitadas = CASE WHEN $4 THEN alertas_habilitadas ELSE false END,
         prueba_respuestas = CASE WHEN $4 THEN prueba_respuestas ELSE 0 END,
         prueba_iniciada_en = CASE WHEN $4 THEN prueba_iniciada_en ELSE NULL END,
         aprobado_en = CASE WHEN $4 THEN aprobado_en ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [actual.id, nombre || user, n, mismo]
    );
    return mapContacto(r.rows[0]);
  }
  if (ocupado) {
    const r = await query(
      `UPDATE wa_contacto SET username = $2, nombre = $3 WHERE id = $1 RETURNING *`,
      [ocupado.id, user, nombre || ocupado.nombre]
    );
    return mapContacto(r.rows[0]);
  }
  const r = await query(
    `INSERT INTO wa_contacto (nombre, telefono, username, prueba_requeridas)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombre || user, n, user, TIEMPOS_WA.respuestasRequeridas]
  );
  return mapContacto(r.rows[0]);
}

export async function setPausaAlertas(contactoId, pausadas) {
  const r = await query(
    `UPDATE wa_contacto SET alertas_pausadas = $2 WHERE id = $1 RETURNING *`,
    [contactoId, pausadas === true]
  );
  return mapContacto(r.rows[0]);
}

export async function listarSilencio(contactoId) {
  const r = await query(`SELECT row_key FROM wa_silencio WHERE contacto_id = $1`, [contactoId]);
  return r.rows.map((row) => row.row_key);
}

export async function setSilencio(contactoId, rowKey, silenciado) {
  if (!rowKey) throw new Error('Equipo requerido');
  if (silenciado) {
    await query(
      `INSERT INTO wa_silencio (contacto_id, row_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactoId, rowKey]
    );
  } else {
    await query(`DELETE FROM wa_silencio WHERE contacto_id = $1 AND row_key = $2`, [
      contactoId,
      rowKey,
    ]);
  }
  return listarSilencio(contactoId);
}

export async function contactosAprobadosPorUsernames(usernames) {
  const lista = [...new Set((usernames ?? []).map((u) => String(u).trim().toLowerCase()).filter(Boolean))];
  if (!lista.length) return [];
  const r = await query(
    `SELECT * FROM wa_contacto
     WHERE lower(username) = ANY($1::text[])
       AND activo = true
       AND alertas_habilitadas = true
       AND alertas_pausadas = false`,
    [lista]
  );
  return r.rows.map(mapContacto);
}

export async function idsSilenciados(contactoIds, rowKey) {
  if (!contactoIds.length || !rowKey) return new Set();
  const r = await query(
    `SELECT contacto_id FROM wa_silencio
     WHERE contacto_id = ANY($1::int[]) AND row_key = $2`,
    [contactoIds, rowKey]
  );
  return new Set(r.rows.map((row) => row.contacto_id));
}

export async function exportarDatos() {
  const contactos = await listarContactos();
  const mensajes = await listarMensajes({ limit: 300 });
  return { version: 1, exportedAt: new Date().toISOString(), contactos, mensajes };
}
