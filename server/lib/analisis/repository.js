import { query, withClient } from '../db.js';

export async function findAnalisisMensual(imei, codigo, anio, mes) {
  const { rows } = await query(
    `SELECT * FROM analisis_mensual
     WHERE imei = $1 AND codigo = $2 AND anio = $3 AND mes = $4`,
    [imei, codigo, anio, mes]
  );
  return rows[0] ?? null;
}

export async function getAnalisisById(id) {
  const { rows } = await query(`SELECT * FROM analisis_mensual WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function upsertAnalisisMensual(data) {
  const {
    imei,
    codigo,
    rowKey,
    anio,
    mes,
    rangoConfigSnapshot,
    analizadoDesde,
    analizadoHasta,
    estado = 'parcial',
  } = data;

  const { rows } = await query(
    `INSERT INTO analisis_mensual (
       imei, codigo, row_key, anio, mes, rango_config_snapshot,
       analizado_desde, analizado_hasta, estado, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,NOW())
     ON CONFLICT (imei, codigo, anio, mes) DO UPDATE SET
       rango_config_snapshot = EXCLUDED.rango_config_snapshot,
       analizado_desde = EXCLUDED.analizado_desde,
       analizado_hasta = EXCLUDED.analizado_hasta,
       estado = EXCLUDED.estado,
       updated_at = NOW()
     RETURNING *`,
    [
      imei,
      codigo,
      rowKey,
      anio,
      mes,
      JSON.stringify(rangoConfigSnapshot ?? null),
      analizadoDesde,
      analizadoHasta,
      estado,
    ]
  );
  return rows[0];
}

export async function listEventos(analisisId) {
  const { rows } = await query(
    `SELECT * FROM analisis_evento
     WHERE analisis_id = $1
     ORDER BY since_at ASC`,
    [analisisId]
  );
  return rows;
}

export async function getEvento(eventoId) {
  const { rows } = await query(`SELECT * FROM analisis_evento WHERE id = $1`, [
    eventoId,
  ]);
  return rows[0] ?? null;
}

export async function replaceEventos(analisisId, eventos, openEnd = Date.now()) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const prev = (
        await client.query(
          `SELECT * FROM analisis_evento WHERE analisis_id = $1`,
          [analisisId]
        )
      ).rows;

      await client.query(`DELETE FROM analisis_evento WHERE analisis_id = $1`, [
        analisisId,
      ]);

      const inserted = [];
      for (const ev of eventos) {
        let clasificacion = ev.clasificacion ?? 'sin_clasificar';
        let detalle = ev.detalle ?? null;
        let analisis = ev.analisis ?? null;
        let clasificadoPor = null;
        let clasificadoAt = null;

        if (
          clasificacion === 'defrost' ||
          clasificacion === 'falso_apagado' ||
          clasificacion === 'falso_fuera'
        ) {
          clasificadoPor = 'sistema';
          clasificadoAt = new Date().toISOString();
        }

        const matchExact = prev.find((p) => p.hash_intervalo === ev.hash);
        const matchOverlap =
          matchExact ??
          prev.find((p) => {
            if (p.tipo !== ev.tipo) return false;
            if (p.clasificacion === 'sin_clasificar') return false;
            const prevDur =
              (p.until_at == null ? openEnd : new Date(p.until_at).getTime()) -
              new Date(p.since_at).getTime();
            if (prevDur <= 0) return false;
            const a0 = new Date(p.since_at).getTime();
            const a1 = p.until_at == null ? openEnd : new Date(p.until_at).getTime();
            const b0 = new Date(ev.since).getTime();
            const b1 = ev.until == null ? openEnd : new Date(ev.until).getTime();
            const ov = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
            return ov / prevDur >= 0.5;
          });

        const HUMAN = new Set(['autorizado', 'programado', 'no_previsto']);
        if (matchOverlap) {
          const human =
            HUMAN.has(matchOverlap.clasificacion) ||
            (matchOverlap.clasificado_por != null &&
              matchOverlap.clasificado_por !== 'sistema' &&
              !['defrost', 'falso_apagado', 'falso_fuera'].includes(
                matchOverlap.clasificacion
              ));
          if (human) {
            // Solo conservar clasificación humana (autorizado / programado / no_previsto).
            // Nunca heredar DEFROST ni falsos del run anterior: el motor manda.
            clasificacion = matchOverlap.clasificacion;
            detalle = matchOverlap.detalle;
            clasificadoPor = matchOverlap.clasificado_por;
            clasificadoAt = matchOverlap.clasificado_at;
          }
        }

        // Coherencia: si el análisis del motor dice FUERA, no dejar etiqueta DEFROST.
        if (
          clasificacion === 'defrost' &&
          typeof analisis === 'string' &&
          analisis.includes('Decisión: FUERA DE RANGO')
        ) {
          clasificacion = 'sin_clasificar';
          detalle = null;
          clasificadoPor = null;
          clasificadoAt = null;
        }
        if (
          clasificacion === 'sin_clasificar' &&
          typeof analisis === 'string' &&
          analisis.includes('Decisión: DEFROST')
        ) {
          clasificacion = 'defrost';
          clasificadoPor = 'sistema';
          clasificadoAt = new Date().toISOString();
        }

        const { rows } = await client.query(
          `INSERT INTO analisis_evento (
             analisis_id, tipo, since_at, until_at, duration_hours,
             clasificacion, detalle, analisis, hash_intervalo, clasificado_por, clasificado_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *`,
          [
            analisisId,
            ev.tipo,
            ev.since,
            ev.until,
            ev.durationHours,
            clasificacion,
            detalle,
            analisis,
            ev.hash,
            clasificadoPor,
            clasificadoAt,
          ]
        );
        inserted.push(rows[0]);
      }

      await client.query('COMMIT');
      return inserted;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}

export async function replaceSemanas(analisisId, semanas) {
  await query(`DELETE FROM analisis_semana WHERE analisis_id = $1`, [analisisId]);
  const out = [];
  for (const s of semanas) {
    const { rows } = await query(
      `INSERT INTO analisis_semana (
         analisis_id, semana_index, desde_at, hasta_at,
         horas_fuera_rango, horas_apagado, horas_sin_transmision,
         horas_defrost, eventos_defrost
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        analisisId,
        s.semanaIndex,
        s.desde,
        s.hasta,
        s.horasFueraRango,
        s.horasApagado,
        s.horasSinTransmision,
        s.horasDefrost ?? 0,
        s.eventosDefrost ?? 0,
      ]
    );
    out.push(rows[0]);
  }
  return out;
}

export async function listSemanas(analisisId) {
  const { rows } = await query(
    `SELECT * FROM analisis_semana
     WHERE analisis_id = $1
     ORDER BY semana_index ASC`,
    [analisisId]
  );
  return rows;
}

export async function updateEventoClasificacion(
  eventoId,
  { clasificacion, detalle, autor }
) {
  const { rows } = await query(
    `UPDATE analisis_evento SET
       clasificacion = $2,
       detalle = $3,
       clasificado_por = $4,
       clasificado_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [eventoId, clasificacion, detalle ?? null, autor ?? null]
  );
  return rows[0] ?? null;
}

export async function saveInterpolatedPoints(analisisId, eventoId, points, autor) {
  const out = [];
  for (const p of points) {
    const { rows } = await query(
      `INSERT INTO analisis_punto_interpolado (
         analisis_id, evento_id, ts, payload, metodo,
         ancla_antes_ts, ancla_despues_ts, creado_por
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
       ON CONFLICT (analisis_id, ts) DO UPDATE SET
         payload = EXCLUDED.payload,
         metodo = EXCLUDED.metodo,
         evento_id = EXCLUDED.evento_id,
         ancla_antes_ts = EXCLUDED.ancla_antes_ts,
         ancla_despues_ts = EXCLUDED.ancla_despues_ts,
         creado_por = EXCLUDED.creado_por,
         creado_at = NOW()
       RETURNING *`,
      [
        analisisId,
        eventoId,
        p.ts,
        JSON.stringify(p.payload),
        p.metodo ?? 'pli_locf_horaria',
        p.anclaAntesTs,
        p.anclaDespuesTs,
        autor ?? null,
      ]
    );
    out.push(rows[0]);
  }
  return out;
}

export async function listInterpolados(analisisId, fromIso, toIso) {
  const { rows } = await query(
    `SELECT * FROM analisis_punto_interpolado
     WHERE analisis_id = $1
       AND ts >= $2::timestamptz
       AND ts <= $3::timestamptz
     ORDER BY ts ASC`,
    [analisisId, fromIso, toIso]
  );
  return rows;
}

export function mapAnalisisRow(row) {
  if (row == null) return null;
  return {
    id: row.id,
    imei: row.imei,
    codigo: row.codigo,
    rowKey: row.row_key,
    anio: row.anio,
    mes: row.mes,
    zonaHoraria: row.zona_horaria,
    rangoConfigSnapshot: row.rango_config_snapshot,
    analizadoDesde: row.analizado_desde,
    analizadoHasta: row.analizado_hasta,
    estado: row.estado,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEventoRow(row, { isAdmin = true } = {}) {
  if (row == null) return null;
  const tipoUi =
    row.tipo === 'sin_transmision' && !isAdmin ? 'validar_datos' : row.tipo;
  let label =
    tipoUi === 'validar_datos'
      ? 'Validar datos'
      : row.tipo === 'sin_transmision'
        ? 'Sin transmisión de datos'
        : row.tipo === 'apagado'
          ? 'Apagado'
          : 'Fuera de rango';
  if (row.clasificacion === 'falso_apagado') {
    label = 'Falso apagado';
  } else if (row.clasificacion === 'falso_fuera') {
    label = 'Fuera corto (descartado)';
  } else if (row.clasificacion === 'defrost') {
    label = 'DEFROST';
  }
  const durationHours = Number(row.duration_hours);
  const durationMinutes =
    Math.round(durationHours * 60 * 10) / 10;
  return {
    id: row.id,
    analisisId: row.analisis_id,
    tipo: row.tipo,
    tipoUi,
    label,
    since: row.since_at,
    until: row.until_at,
    durationHours,
    durationMinutes,
    clasificacion: row.clasificacion,
    detalle: row.detalle,
    ...(isAdmin
      ? {
          analisis:
            row.analisis ??
            'Sin texto de análisis del motor. Regenerar el mes para generar la lógica aplicada.',
        }
      : {}),
    hashIntervalo: row.hash_intervalo,
    clasificadoPor: row.clasificado_por,
    clasificadoAt: row.clasificado_at,
  };
}

export function mapSemanaRow(row) {
  return {
    semanaIndex: row.semana_index,
    desde: row.desde_at,
    hasta: row.hasta_at,
    horasFueraRango: Number(row.horas_fuera_rango),
    horasApagado: Number(row.horas_apagado),
    horasSinTransmision: Number(row.horas_sin_transmision),
    horasDefrost: Number(row.horas_defrost ?? 0),
    eventosDefrost: Number(row.eventos_defrost ?? 0),
  };
}
