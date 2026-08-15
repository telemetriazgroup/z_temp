import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchDashboardOverview,
  markDashboardDeviceReviewed,
  fetchDashboardUserActivity,
} from '../modules/correo/correoServerApi';
import type {
  DashboardOverview,
  DashboardPeriodAverage,
  DashboardUserActivityDetail,
  DashboardUserLogin,
} from '../modules/correo/types';
import { useAuth } from '../AuthContext';
import { useT } from '../i18n';
import { userIsMonitoreoNavigation, userIsSuperAdmin } from '../modules/usuario';
import {
  listadoFilterPath,
  useDispositivosFleet,
} from '../DispositivosFleetContext';
import type { DispositivoUltimoEstado } from '../types';
import { takePreloadedOverview } from '../lib/dashboardPreload';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { cn } from '../components/ui/utils';
import {
  RefreshCw,
  AlertCircle,
  Radio,
  ChevronRight,
  List,
  BookOpen,
  Wifi,
  WifiOff,
  Clock,
  Thermometer,
  ThermometerSnowflake,
  Mail,
  Siren,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  PackagePlus,
  Link2,
  Check,
  History,
  LogIn,
} from 'lucide-react';
import { Historial3hModal, type Historial3hTarget } from '../components/Historial3hModal';
import { dispositivoTieneHistorialOficial } from '../api/datosOficiales';
import type { DispositivoOrigenCodigo } from '../types';

function detallePath(imei: string, codigo?: string | null): string {
  const q = new URLSearchParams({ imei });
  if (codigo) q.set('codigo', codigo);
  return `/listado/detalle?${q.toString()}`;
}

function formatDayLabel(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const todayKey = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
    });
    const dayKey = d.toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
    });
    const stamp = d.toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return dayKey === todayKey ? stamp : `${stamp} · pasado`;
  } catch {
    return iso;
  }
}

function formatOfflineDuration(minutos: number | null | undefined): string {
  if (minutos == null || !Number.isFinite(minutos)) return 'sin dato';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = minutos / 60;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} d`;
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted';
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50/40'
        : tone === 'bad'
          ? 'border-red-200 bg-red-50/40'
          : 'bg-card';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 sm:p-4 text-left w-full',
        toneClass,
        onClick && 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div> : null}
    </Comp>
  );
}

function AvgBlock({
  title,
  avg,
}: {
  title: string;
  avg: DashboardPeriodAverage;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {avg.samples === 0 ? (
        <p className="text-xs text-muted-foreground">Sin muestras aún</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Online</dt>
          <dd className="text-right tabular-nums font-medium">{avg.online}</dd>
          <dt className="text-muted-foreground">Wait</dt>
          <dd className="text-right tabular-nums">{avg.wait}</dd>
          <dt className="text-muted-foreground">Offline</dt>
          <dd className="text-right tabular-nums">{avg.offline}</dd>
          <dt className="text-muted-foreground">En rango</dt>
          <dd className="text-right tabular-nums text-emerald-700">{avg.en_rango}</dd>
          <dt className="text-muted-foreground">Fuera</dt>
          <dd className="text-right tabular-nums text-red-700">{avg.fuera_rango}</dd>
          <dt className="text-muted-foreground">% online</dt>
          <dd className="text-right tabular-nums">{avg.pct_online}%</dd>
          <dt className="text-muted-foreground">% en rango</dt>
          <dd className="text-right tabular-nums">{avg.pct_en_rango}%</dd>
        </dl>
      )}
    </div>
  );
}

export default function Inicio() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hydrateFromDispositivos } = useDispositivosFleet();
  const esMonitoreo = userIsMonitoreoNavigation(user);
  const esSuper = user?.superUser === true;

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [historial3h, setHistorial3h] = useState<Historial3hTarget | null>(null);
  const [userDetailTarget, setUserDetailTarget] =
    useState<DashboardUserLogin | null>(null);
  const [userDetail, setUserDetail] =
    useState<DashboardUserActivityDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailError, setUserDetailError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setError(null);
    const force = opts?.force === true;

    if (!force) {
      const preloaded = takePreloadedOverview(user?.username);
      if (preloaded != null) {
        setData(preloaded);
        const fleetDevices = preloaded.fleet?.dispositivos;
        if (Array.isArray(fleetDevices) && fleetDevices.length > 0) {
          hydrateFromDispositivos(fleetDevices as DispositivoUltimoEstado[], {
            zonaHoraria: preloaded.fleet?.zona_horaria,
          });
        }
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const overview = await fetchDashboardOverview({
        username: user?.username,
        superUser: userIsSuperAdmin(user) || user?.superUser === true,
      });
      setData(overview);
      const fleetDevices = overview.fleet?.dispositivos;
      if (Array.isArray(fleetDevices) && fleetDevices.length > 0) {
        hydrateFromDispositivos(fleetDevices as DispositivoUltimoEstado[], {
          zonaHoraria: overview.fleet?.zona_horaria,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inicio.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.username, user?.superUser, user, hydrateFromDispositivos, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const markReviewed = async (
    rowKey: string,
    status: 'revisado' | 'ignorado'
  ) => {
    setReviewing(rowKey);
    try {
      await markDashboardDeviceReviewed(rowKey, status, {
        username: user?.username,
        superUser: true,
      });
      await load({ force: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar revisión');
    } finally {
      setReviewing(null);
    }
  };

  const openUserActivity = async (login: DashboardUserLogin) => {
    setUserDetailTarget(login);
    setUserDetail(null);
    setUserDetailError(null);
    setUserDetailLoading(true);
    try {
      const detail = await fetchDashboardUserActivity(login.username, {
        username: user?.username,
        superUser: true,
        limit: 100,
      });
      setUserDetail(detail);
    } catch (e) {
      setUserDetailError(
        e instanceof Error ? e.message : 'No se pudo cargar el historial'
      );
    } finally {
      setUserDetailLoading(false);
    }
  };

  const live = data?.live;
  const chartData =
    data?.weekSeries.map((p) => ({
      ...p,
      label: formatDayLabel(p.day),
    })) ?? [];

  const TrendIcon =
    data?.weekStatus.tendencia === 'up'
      ? TrendingUp
      : data?.weekStatus.tendencia === 'down'
        ? TrendingDown
        : Minus;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('inicio.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {esMonitoreo ? (
              <>
                Hola,{' '}
                <span className="font-medium text-foreground">
                  {user?.displayName || user?.username}
                </span>
                .
              </>
            ) : (
              'Resumen operativo de la flota y extractos urgentes.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load({ force: true })} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            {t('inicio.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/listado')}>
            <List className="h-4 w-4 mr-2" />
            {t('inicio.viewList')}
          </Button>
          {esMonitoreo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/catalogo-alarmas')}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Catálogo alarmas
            </Button>
          )}
        </div>
      </div>

      {loading && data == null && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin" />
          Cargando dashboard…
        </div>
      )}

      {!loading && error != null && data == null && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-center gap-3">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive font-medium">{error}</p>
          <Button variant="outline" onClick={() => void load({ force: true })}>
            Reintentar
          </Button>
        </div>
      )}

      {data != null && live != null && (
        <>
          {(error != null || data.telemetryError) && (
            <p className="text-xs text-amber-700">{error ?? data.telemetryError}</p>
          )}

          {esSuper && data.links?.alert?.active && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-900">Links API con falla</div>
                <p className="text-sm text-amber-800">{data.links.alert.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              label="Online"
              value={live.online}
              tone="ok"
              icon={Wifi}
              hint={`${live.pct_online ?? 0}% · ${t('inicio.viewList').toLowerCase()}`}
              onClick={() => navigate(listadoFilterPath({ status: 'ONLINE' }))}
            />
            <KpiCard
              label="Wait"
              value={live.wait}
              tone="warn"
              icon={Clock}
              hint={t('inicio.viewList')}
              onClick={() => navigate(listadoFilterPath({ status: 'WAIT' }))}
            />
            <KpiCard
              label="Offline"
              value={live.offline}
              tone="muted"
              icon={WifiOff}
              hint={t('inicio.viewList')}
              onClick={() => navigate(listadoFilterPath({ status: 'OFFLINE' }))}
            />
            <KpiCard
              label="En rango"
              value={live.en_rango}
              tone="ok"
              icon={Thermometer}
              hint={
                live.pct_en_rango != null
                  ? `${live.pct_en_rango}% · ${t('inicio.viewList').toLowerCase()}`
                  : t('inicio.viewList')
              }
              onClick={() => navigate(listadoFilterPath({ rango: 'en' }))}
            />
            <KpiCard
              label="Fuera de rango"
              value={live.fuera_rango}
              tone={live.fuera_rango > 0 ? 'bad' : 'ok'}
              icon={ThermometerSnowflake}
              hint={t('inicio.viewList')}
              onClick={() => navigate(listadoFilterPath({ rango: 'fuera' }))}
            />
          </div>

          {esSuper && (data.links?.current?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Links de telemetría (último estatus + 3 h)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {data.links.current.map((link) => {
                    const last = link.last_success?.counts;
                    return (
                      <div
                        key={link.codigo}
                        className={cn(
                          'rounded-lg border p-3',
                          link.ok
                            ? 'border-emerald-200'
                            : 'border-red-300 bg-red-50/40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">{link.codigo}</span>
                          <Badge variant={link.ok ? 'secondary' : 'destructive'}>
                            {link.ok ? 'OK' : 'DOWN'}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Check {formatWhen(link.checked_at)}
                          {link.latency_ms != null ? ` · ${link.latency_ms} ms` : ''}
                        </div>
                        {!link.ok && (
                          <>
                            <p className="text-xs text-red-700 mt-1 truncate">
                              {link.error_message || 'Sin respuesta'}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Último OK {formatWhen(link.last_ok_at)}
                              {last
                                ? ` · ${last.total ?? link.device_count} eq (${last.online ?? '—'} online)`
                                : ''}
                            </p>
                          </>
                        )}
                        {link.ok && (
                          <p className="text-xs mt-1 tabular-nums">
                            {link.device_count} eq · {link.online_count} online ·{' '}
                            {link.wait_count} wait
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(data.links.probes3h?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Trazabilidad: {data.links.probes3h.length} sondas en las últimas 3 h
                    (cada consulta de último estado).
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendIcon className="h-4 w-4" />
                Estatus de la semana
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <div className="font-medium">{data.weekStatus.label}</div>
                <p className="text-sm text-muted-foreground">{data.weekStatus.detalle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.weekStatus.delta_pct_online != null && (
                  <Badge variant="outline">
                    Online {data.weekStatus.delta_pct_online > 0 ? '+' : ''}
                    {data.weekStatus.delta_pct_online} pp
                  </Badge>
                )}
                {data.weekStatus.delta_pct_en_rango != null && (
                  <Badge variant="outline">
                    En rango {data.weekStatus.delta_pct_en_rango > 0 ? '+' : ''}
                    {data.weekStatus.delta_pct_en_rango} pp
                  </Badge>
                )}
                {data.latestSnapshotAt && (
                  <Badge variant="secondary">
                    Snapshot {formatWhen(data.latestSnapshotAt)}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Promedios históricos
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <AvgBlock title="Día" avg={data.averages.dia} />
              <AvgBlock title="Semana" avg={data.averages.semana} />
              <AvgBlock title="Mes" avg={data.averages.mes} />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Conexión (promedio diario)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Aún no hay histórico de snapshots.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="online" name="Online" stackId="1" stroke="#059669" fill="#6ee7b7" />
                      <Area type="monotone" dataKey="wait" name="Wait" stackId="1" stroke="#d97706" fill="#fcd34d" />
                      <Area type="monotone" dataKey="offline" name="Offline" stackId="1" stroke="#64748b" fill="#cbd5e1" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Temperatura (promedio diario)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Sin datos semanales todavía.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="en_rango" name="En rango" fill="#059669" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="fuera_rango" name="Fuera" fill="#dc2626" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Urgente / extractos
            </h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Siren className="h-4 w-4" />
                    Últimos equipos con alarmas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.urgent.alarmas.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Sin alarmas pendientes
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {data.urgent.alarmas.map((a) => (
                        <li key={a.id} className="py-2">
                          <Link
                            to={detallePath(a.imei, a.codigo)}
                            className="font-medium hover:underline truncate block"
                          >
                            {a.descripcionEquipo || a.imei}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {a.alertKind === 'apagado' ? 'Apagado' : 'Fuera de rango'}
                            {a.horasFueraRango != null ? ` · ${a.horasFueraRango}h` : ''}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatWhen(a.enviadoAt)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Últimos correos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.urgent.envios.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Sin envíos recientes
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {data.urgent.envios.map((e) => (
                        <li key={e.id} className="py-2">
                          <div className="font-medium truncate">
                            {e.descripcionEquipo || e.imei}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {e.subject}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {formatWhen(e.sentAt)} · {e.umbralHoras}h
                            {!e.success ? ' · error' : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-600" />
                    Equipos conectados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.urgent.conectados.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Ningún equipo online
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {data.urgent.conectados.map((c) => (
                        <li key={c.rowKey}>
                          <Link
                            to={detallePath(c.imei, c.codigo)}
                            className="flex items-center gap-2 py-2 hover:bg-muted/40 -mx-1 px-1 rounded"
                          >
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{c.nombre}</div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {c.codigo ? `${c.codigo} · ` : ''}
                                {c.imei}
                              </div>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PackagePlus className="h-4 w-4" />
                    Más tiempo fuera de línea
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(data.devices?.longestOffline ?? data.devices?.recentlyRegistered ?? [])
                    .length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No hay equipos wait/offline
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {(
                        data.devices.longestOffline ??
                        data.devices.recentlyRegistered
                      ).map((d) => (
                        <li key={d.rowKey} className="py-2">
                          <Link
                            to={detallePath(d.imei, d.codigo)}
                            className="font-medium hover:underline truncate block"
                          >
                            {d.nombre || d.imei}
                          </Link>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {d.codigo ? `${d.codigo} · ` : ''}
                            {d.imei}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                            <span className="uppercase">{d.estado_conexion}</span>
                            <span>
                              {formatOfflineDuration(d.minutos_desde_ultimo_dato)}
                            </span>
                            <span>
                              último dato {formatWhen(d.ultima_actualizacion)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {esSuper && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Últimos usuarios conectados
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground font-normal pt-1">
                      Usuarios distintos. Clic para ver historial de accesos y
                      acciones.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {(data.users?.recentLogins ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        Sin logins registrados aún
                      </p>
                    ) : (
                      <ul className="divide-y text-sm">
                        {data.users.recentLogins.map((u) => (
                          <li key={u.username}>
                            <button
                              type="button"
                              className="w-full py-2 flex items-center justify-between gap-2 text-left hover:bg-muted/40 rounded-md px-1 -mx-1 transition-colors"
                              onClick={() => void openUserActivity(u)}
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate flex items-center gap-1.5">
                                  {u.username}
                                  {(u.loginCount ?? 1) > 1 && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] h-5 px-1.5 font-normal"
                                    >
                                      {u.loginCount} accesos
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {u.role ?? '—'}
                                  {u.superUser ? ' · super' : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[11px] text-muted-foreground">
                                  {formatWhen(u.logged_in_at)}
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}

              {esSuper && (
                <Card className="border-amber-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <PackagePlus className="h-4 w-4 text-amber-700" />
                      Revisión rápida — equipos nuevos
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground font-normal pt-1">
                      Solo IMEI/código que aún no estaban registrados en la flota
                      (primer avistamiento tras el registro de últimos estados).
                    </p>
                  </CardHeader>
                  <CardContent>
                    {(data.devices?.pendingReview ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No hay equipos nuevos pendientes
                      </p>
                    ) : (
                      <ul className="divide-y text-sm">
                        {data.devices.pendingReview.map((d) => (
                          <li key={d.rowKey} className="py-2 space-y-1">
                            <Link
                              to={detallePath(d.imei, d.codigo)}
                              className="font-medium hover:underline truncate block"
                            >
                              {d.imei}
                            </Link>
                            <div className="text-[11px] text-muted-foreground">
                              {d.codigo ?? '—'} · 1ª vez {formatWhen(d.first_seen_at)} ·{' '}
                              {d.first_estado_conexion ?? d.last_estado_conexion ?? '—'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {dispositivoTieneHistorialOficial(
                                d.codigo as DispositivoOrigenCodigo | undefined
                              ) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    setHistorial3h({
                                      imei: d.imei,
                                      codigo: d.codigo as DispositivoOrigenCodigo,
                                      nombre: d.imei,
                                    })
                                  }
                                >
                                  <History className="h-3 w-3 mr-1" />
                                  Últimas 3 h
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={reviewing === d.rowKey}
                                onClick={() => void markReviewed(d.rowKey, 'revisado')}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Revisado
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                disabled={reviewing === d.rowKey}
                                onClick={() => void markReviewed(d.rowKey, 'ignorado')}
                              >
                                Ignorar
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      <Dialog
        open={userDetailTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setUserDetailTarget(null);
            setUserDetail(null);
            setUserDetailError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial de {userDetailTarget?.username}
            </DialogTitle>
            <DialogDescription>
              Línea de tiempo de accesos y acciones realizadas
              {userDetail
                ? ` · ${userDetail.loginCount} login(s) registrados`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {userDetailLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Cargando historial…
              </div>
            )}
            {userDetailError && (
              <p className="text-sm text-destructive py-4 text-center">
                {userDetailError}
              </p>
            )}
            {!userDetailLoading &&
              !userDetailError &&
              (userDetail?.timeline?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin eventos registrados para este usuario
                </p>
              )}
            {!userDetailLoading &&
              (userDetail?.timeline?.length ?? 0) > 0 && (
                <ol className="relative border-l border-border ml-3 space-y-0">
                  {userDetail!.timeline.map((item) => (
                    <li key={item.id} className="ml-4 pb-4 last:pb-0">
                      <span
                        className={cn(
                          'absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background',
                          item.kind === 'login'
                            ? 'bg-emerald-500'
                            : 'bg-sky-500'
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Badge
                          variant={
                            item.kind === 'login' ? 'default' : 'secondary'
                          }
                          className="text-[10px] h-5"
                        >
                          {item.kind === 'login' ? (
                            <span className="inline-flex items-center gap-1">
                              <LogIn className="h-3 w-3" />
                              Acceso
                            </span>
                          ) : (
                            item.action
                          )}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatWhen(item.at)}
                        </span>
                      </div>
                      <p className="text-sm mt-1 leading-snug">
                        {item.summary || item.action}
                      </p>
                      {item.module && item.kind === 'action' && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Módulo: {item.module}
                          {item.targetId ? ` · ${item.targetId}` : ''}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
          </div>
        </DialogContent>
      </Dialog>

      <Historial3hModal
        open={historial3h != null}
        onOpenChange={(open) => {
          if (!open) setHistorial3h(null);
        }}
        target={historial3h}
      />
    </div>
  );
}
