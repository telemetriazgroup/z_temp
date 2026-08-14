import express from 'express';
import { ensureDashboardSchema } from '../db.js';
import { getEnvios, getIncidentes } from '../alertEngine.js';
import { getUserByUsername } from '../usersRepository.js';
import { getDeviceNameByImei } from '../deviceNamesRepository.js';
import { fetchAllDispositivosDetailed, deviceRowKey } from '../telemetry.js';
import {
  getPeriodAverages,
  getDailySeries,
  getLatestFleetSnapshot,
} from './repository.js';
import {
  computeFleetCounts,
  filterDispositivosForUser,
  captureDashboardSnapshotSafe,
} from './snapshot.js';
import { getLinkStatuses, getLinkProbeHistory } from './linkHealth.js';
import {
  listDevicesPendingReview,
  markDeviceReviewed,
} from './deviceRegistry.js';
import { listRecentLogins } from './userActivity.js';
import { appendAuditEvent } from '../auditLogRepository.js';

function resolveAccessUser(req) {
  const username = String(req.headers['x-ztrack-user'] ?? '').trim();
  if (!username) return null;
  return getUserByUsername(username);
}

function isSuper(req, user) {
  return (
    req.headers['x-ztrack-super-user'] === 'true' ||
    user?.superUser === true
  );
}

function restrictedImeis(user) {
  if (!user || user.superUser === true || user.deviceAccess?.includes('all')) {
    return null;
  }
  return (user.deviceAccess ?? []).map(String).filter((x) => x && x !== 'all');
}

function weekStatusFromSeries(series, averages) {
  const cur = averages?.semana ?? null;
  if (!cur || cur.samples === 0) {
    return {
      label: 'Sin histórico aún',
      detalle: 'Los promedios semanales aparecerán cuando haya snapshots registrados.',
      tendencia: 'neutral',
      pct_online: 0,
      pct_en_rango: 0,
      delta_pct_online: null,
      delta_pct_en_rango: null,
    };
  }

  if (series && series.length >= 4) {
    const half = Math.floor(series.length / 2);
    const older = series.slice(0, half);
    const newer = series.slice(half);
    const avg = (arr, key) =>
      arr.length
        ? arr.reduce((s, x) => s + (Number(x[key]) || 0), 0) / arr.length
        : 0;
    const prevOnline = avg(older, 'pct_online');
    const newOnline = avg(newer, 'pct_online');
    const prevRango = avg(older, 'pct_en_rango');
    const newRango = avg(newer, 'pct_en_rango');
    const dOnline = Math.round((newOnline - prevOnline) * 10) / 10;
    const dRango = Math.round((newRango - prevRango) * 10) / 10;
    let tendencia = 'stable';
    if (dOnline >= 2 || dRango >= 2) tendencia = 'up';
    else if (dOnline <= -2 || dRango <= -2) tendencia = 'down';
    return {
      label:
        tendencia === 'up'
          ? 'Semana en mejora'
          : tendencia === 'down'
            ? 'Semana a vigilar'
            : 'Semana estable',
      detalle: `Promedio online ${cur.pct_online}% · en rango ${cur.pct_en_rango}%`,
      tendencia,
      pct_online: cur.pct_online,
      pct_en_rango: cur.pct_en_rango,
      delta_pct_online: dOnline,
      delta_pct_en_rango: dRango,
    };
  }

  return {
    label: 'Estatus semanal',
    detalle: `Promedio online ${cur.pct_online}% · en rango ${cur.pct_en_rango}%`,
    tendencia: 'neutral',
    pct_online: cur.pct_online,
    pct_en_rango: cur.pct_en_rango,
    delta_pct_online: null,
    delta_pct_en_rango: null,
  };
}

function buildUrgent(dispositivosVisibles, imeisFilter, limit = 5) {
  const allowed =
    Array.isArray(imeisFilter) && imeisFilter.length > 0
      ? new Set(imeisFilter)
      : null;

  const envios = getEnvios()
    .filter((e) => !allowed || allowed.has(e.imei))
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      subject: e.subject,
      imei: e.imei,
      descripcionEquipo: e.descripcionEquipo,
      umbralHoras: e.umbralHoras,
      sentAt: e.sentAt,
      success: e.success,
      grupoNombre: e.grupoNombre,
    }));

  const alarmas = getIncidentes()
    .filter((i) => i.archivado !== true && i.estado === 'pendiente')
    .filter((i) => !allowed || allowed.has(i.imei))
    .slice(0, limit)
    .map((i) => ({
      id: i.id,
      imei: i.imei,
      codigo: i.codigo,
      descripcionEquipo: i.descripcionEquipo,
      alertKind: i.alertKind ?? null,
      umbralHoras: i.umbralHoras ?? null,
      horasFueraRango: i.horasFueraRango ?? null,
      enviadoAt: i.enviadoAt,
      estado: i.estado,
      subject: i.subject ?? null,
    }));

  const conectados = dispositivosVisibles
    .filter((d) => String(d.estado_conexion).toLowerCase() === 'online')
    .slice(0, limit)
    .map((d) => {
      const nombre =
        getDeviceNameByImei(d.imei) ||
        d.ultimo_dato?.nombre_contenedor ||
        d.imei;
      return {
        imei: d.imei,
        codigo: d.codigo ?? null,
        rowKey: deviceRowKey(d),
        nombre,
        power_state_texto: d.power_state_texto,
        en_rango: d.en_rango,
        en_defrost: d.en_defrost,
        ultima_actualizacion: d.ultima_actualizacion,
      };
    });

  const fueraRango = dispositivosVisibles
    .filter(
      (d) =>
        String(d.estado_conexion).toLowerCase() === 'online' &&
        d.en_rango === false
    )
    .slice(0, limit)
    .map((d) => ({
      imei: d.imei,
      codigo: d.codigo ?? null,
      rowKey: deviceRowKey(d),
      nombre: getDeviceNameByImei(d.imei) || d.imei,
      en_rango: false,
      ultima_actualizacion: d.ultima_actualizacion,
    }));

  return { envios, alarmas, conectados, fueraRango };
}

/** Equipos fuera de línea (offline/wait) con más minutos sin dato, descendente. */
function buildLongestOffline(dispositivosVisibles, limit = 5) {
  return dispositivosVisibles
    .filter((d) => {
      const s = String(d.estado_conexion ?? '').toLowerCase();
      return s === 'offline' || s === 'wait';
    })
    .map((d) => {
      const minutos =
        d.minutos_desde_ultimo_dato != null &&
        Number.isFinite(Number(d.minutos_desde_ultimo_dato))
          ? Number(d.minutos_desde_ultimo_dato)
          : null;
      return {
        imei: d.imei,
        codigo: d.codigo ?? null,
        rowKey: deviceRowKey(d),
        nombre:
          getDeviceNameByImei(d.imei) ||
          d.ultimo_dato?.nombre_contenedor ||
          d.imei,
        estado_conexion: String(d.estado_conexion ?? 'offline').toLowerCase(),
        minutos_desde_ultimo_dato: minutos,
        ultima_actualizacion: d.ultima_actualizacion ?? null,
      };
    })
    .sort((a, b) => {
      const ma = a.minutos_desde_ultimo_dato;
      const mb = b.minutos_desde_ultimo_dato;
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return mb - ma;
    })
    .slice(0, limit);
}

function emptyLive() {
  return {
    total: 0,
    online: 0,
    wait: 0,
    offline: 0,
    power_on: 0,
    power_off: 0,
    en_defrost: 0,
    en_rango: 0,
    fuera_rango: 0,
    apagado: 0,
    indeterminado: 0,
    pct_online: 0,
    pct_en_rango: null,
    by_codigo: {},
    captured_at: new Date().toISOString(),
  };
}

export function createDashboardRouter() {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    try {
      await ensureDashboardSchema();
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  router.post('/snapshot', async (req, res) => {
    if (req.headers['x-ztrack-super-user'] !== 'true') {
      return res.status(403).json({ ok: false, error: 'Solo admin puede forzar snapshot' });
    }
    try {
      await ensureDashboardSchema();
      const data = await captureDashboardSnapshotSafe();
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/devices/:rowKey/review', async (req, res) => {
    try {
      const user = resolveAccessUser(req);
      if (!isSuper(req, user)) {
        return res.status(403).json({ ok: false, error: 'Solo superusuario' });
      }
      await ensureDashboardSchema();
      const status = String(req.body?.status ?? 'revisado');
      const data = await markDeviceReviewed(req.params.rowKey, {
        status,
        by: user?.username ?? 'admin',
      });
      if (!data) {
        return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });
      }
      try {
        appendAuditEvent({
          actorUsername: user?.username ?? 'admin',
          actorId: user?.id,
          action: 'dashboard.device_review',
          module: 'dashboard',
          summary: `Marcó revisión ${status} en ${req.params.rowKey}`,
          targetId: req.params.rowKey,
          detail: { status },
        });
      } catch {
        // no bloquear
      }
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get('/overview', async (req, res) => {
    try {
      await ensureDashboardSchema();
      const user = resolveAccessUser(req);
      const imeis = restrictedImeis(user);
      const superUser = isSuper(req, user);

      let dispositivos = [];
      let telemetryError = null;
      let liveLinks = [];
      try {
        const detailed = await fetchAllDispositivosDetailed();
        dispositivos = detailed.dispositivos;
        liveLinks = detailed.links;
        if (dispositivos.length === 0 && detailed.errors.length) {
          telemetryError = detailed.errors.join(' | ');
        }
      } catch (e) {
        telemetryError = e.message;
      }

      const visibles = filterDispositivosForUser(dispositivos, user);
      const { fleet: liveCounts } =
        visibles.length > 0
          ? computeFleetCounts(visibles)
          : { fleet: emptyLive() };

      const [
        averages,
        weekSeries,
        prevWeekSeries,
        linkStatuses,
        linkProbes,
        pendingReview,
        recentLogins,
        latest,
      ] = await Promise.all([
        getPeriodAverages({ imeis }),
        getDailySeries({ days: 7, imeis }),
        getDailySeries({ days: 14, imeis }),
        getLinkStatuses(),
        getLinkProbeHistory({ hours: 3 }),
        superUser ? listDevicesPendingReview({ limit: 5 }) : Promise.resolve([]),
        superUser ? listRecentLogins({ limit: 5 }) : Promise.resolve([]),
        imeis ? Promise.resolve(null) : getLatestFleetSnapshot(),
      ]);

      const weekStatus = weekStatusFromSeries(prevWeekSeries, averages);
      const urgent = buildUrgent(visibles, imeis, 5);
      const longestOffline = buildLongestOffline(visibles, 5);

      const linksDown = linkStatuses.filter((l) => !l.ok);
      const linkAlert =
        superUser && linksDown.length > 0
          ? {
              active: true,
              message: `Sin conexión en ${linksDown.map((l) => l.codigo).join(', ')}. Se muestra el último estatus OK guardado.`,
              codigos: linksDown.map((l) => l.codigo),
            }
          : { active: false, message: null, codigos: [] };

      res.json({
        ok: true,
        data: {
          live: {
            total: liveCounts.total,
            online: liveCounts.online,
            wait: liveCounts.wait,
            offline: liveCounts.offline,
            power_on: liveCounts.power_on,
            power_off: liveCounts.power_off,
            en_defrost: liveCounts.en_defrost,
            en_rango: liveCounts.en_rango,
            fuera_rango: liveCounts.fuera_rango,
            apagado: liveCounts.apagado,
            indeterminado: liveCounts.indeterminado,
            pct_online: liveCounts.pct_online,
            pct_en_rango: liveCounts.pct_en_rango,
            by_codigo: liveCounts.by_codigo,
            captured_at: liveCounts.captured_at,
          },
          averages,
          weekSeries,
          weekStatus,
          latestSnapshotAt: latest?.captured_at ?? null,
          telemetryError,
          urgent,
          links: {
            current: linkStatuses,
            liveCheck: liveLinks,
            probes3h: linkProbes,
            alert: linkAlert,
          },
          devices: {
            pendingReview: superUser ? pendingReview : [],
            /** @deprecated alias — usar longestOffline */
            recentlyRegistered: longestOffline,
            longestOffline,
          },
          /** Flota completa ya cargada para hidratar listado sin reconsultar. */
          fleet: {
            dispositivos: visibles,
            zona_horaria: 'GMT-5',
            captured_at: liveCounts.captured_at ?? new Date().toISOString(),
          },
          users: {
            recentLogins: superUser ? recentLogins : [],
          },
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      await ensureDashboardSchema();
      const user = resolveAccessUser(req);
      const imeis = restrictedImeis(user);
      const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 90);
      const series = await getDailySeries({ days, imeis });
      const averages = await getPeriodAverages({ imeis });
      res.json({ ok: true, data: { series, averages } });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
