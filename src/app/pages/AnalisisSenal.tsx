import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import {
  fetchSenalBehavior,
  fetchSenalJob,
  startSenalJob,
  pauseSenalJob,
  resumeSenalJob,
  type SenalBehaviorReport,
  type SenalJob,
} from '../modules/senal';
import { AnalisisSenalDetalle } from './AnalisisSenalDetalle';
import { useLocale } from '../i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import {
  RadioTower,
  RefreshCw,
  Download,
  MapPin,
  Clock,
  WifiOff,
  Activity,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '../components/ui/utils';

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtLima(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(estado: string) {
  const s = String(estado ?? '').toLowerCase();
  if (s === 'online')
    return <Badge className="bg-emerald-600 text-[10px] h-5">online</Badge>;
  if (s === 'wait')
    return <Badge className="bg-amber-600 text-[10px] h-5">wait</Badge>;
  return <Badge variant="destructive" className="text-[10px] h-5">offline</Badge>;
}

function HourBars({
  wait,
  offline,
  labelWait,
  labelOffline,
}: {
  wait: number[];
  offline: number[];
  labelWait: string;
  labelOffline: string;
}) {
  const max = Math.max(1, ...wait, ...offline);
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500" />
          {labelWait}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500" />
          {labelOffline}
        </span>
      </div>
      <div className="flex gap-0.5 items-end h-28 overflow-x-auto pb-1">
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="flex flex-col items-center gap-0.5 h-full justify-end min-w-[1.1rem] flex-1"
          >
            <div className="w-full flex flex-col gap-px justify-end flex-1 max-w-[14px] mx-auto">
              <div
                className="w-full bg-amber-500/80 rounded-t-sm min-h-[1px]"
                style={{ height: `${(wait[h] / max) * 70}%` }}
                title={`${h}:00 wait ${wait[h]} min`}
              />
              <div
                className="w-full bg-red-500/80 rounded-b-sm min-h-[1px]"
                style={{ height: `${(offline[h] / max) * 70}%` }}
                title={`${h}:00 offline ${offline[h]} min`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {String(h).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalisisSenal() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { imei } = useParams<{ imei?: string }>();
  const isSuper = userIsSuperAdmin(user);

  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<SenalBehaviorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [job, setJob] = useState<SenalJob | null>(null);

  const loadCache = useCallback(async (silent = false) => {
    if (!user?.username || !isSuper || imei) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchSenalBehavior({
        anio,
        mes,
        mode: 'cache',
        username: user.username,
        superUser: true,
      });
      setReport(data);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : t('senal.loadError'));
        setReport(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.username, isSuper, anio, mes, t, imei]);

  const refreshJob = useCallback(async () => {
    if (!user?.username || !isSuper) return;
    try {
      setJob(await fetchSenalJob(user.username, true));
    } catch {
      /* ignore */
    }
  }, [user?.username, isSuper]);

  useEffect(() => {
    void loadCache(false);
    void refreshJob();
  }, [loadCache, refreshJob]);

  useEffect(() => {
    if (job?.status !== 'running') return;
    const id = window.setInterval(() => {
      void refreshJob();
      void loadCache(true);
    }, 2500);
    return () => window.clearInterval(id);
  }, [job?.status, refreshJob, loadCache]);

  const runJob = async (fromScratch = false) => {
    if (!user?.username) return;
    try {
      const next = await startSenalJob(user.username, true, fromScratch);
      setJob(next);
      if (fromScratch) void loadCache(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.loadError'));
    }
  };

  const pauseJob = async () => {
    if (!user?.username) return;
    try {
      setJob(await pauseSenalJob(user.username, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.loadError'));
    }
  };

  const resumeJob = async () => {
    if (!user?.username) return;
    try {
      setJob(await resumeSenalJob(user.username, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.loadError'));
    }
  };

  const filteredDevices = useMemo(() => {
    if (!report) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return report.devices;
    return report.devices.filter((d) => {
      const ubi = d.ubicacion;
      return (
        d.imei.toLowerCase().includes(q) ||
        (d.nombre ?? '').toLowerCase().includes(q) ||
        (d.codigo ?? '').toLowerCase().includes(q) ||
        (ubi?.pais ?? '').toLowerCase().includes(q) ||
        (ubi?.departamento ?? '').toLowerCase().includes(q) ||
        (ubi?.distrito ?? '').toLowerCase().includes(q) ||
        (ubi?.zona ?? '').toLowerCase().includes(q)
      );
    });
  }, [report, filter]);

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `senal_${report.anio}-${String(report.mes).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuper) {
    return <Navigate to="/" replace />;
  }

  if (imei && user?.username) {
    return <AnalisisSenalDetalle imei={imei} username={user.username} />;
  }

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <RadioTower className="h-7 w-7 text-sky-600" />
            {t('senal.title')}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('senal.subtitle')}
          </p>
          {report && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge variant="secondary" className="text-[10px]">
                {t('senal.persistedBadge')}
              </Badge>
              {report.finalized ? (
                <Badge className="bg-emerald-700 text-[10px]">
                  {t('senal.finalizedBadge')}
                </Badge>
              ) : (
                <Badge className="bg-sky-700 text-[10px]">
                  {t('senal.incrementalBadge')}
                </Badge>
              )}
              {report.ensureStatus && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {report.ensureStatus}
                  {report.processedNew
                    ? ` +${report.processedNew}`
                    : ''}
                </Badge>
              )}
              {report.lastProcessedAt && (
                <Badge variant="outline" className="text-[10px]">
                  {t('senal.updatedUntil')}{' '}
                  {fmtLima(report.lastProcessedAt, locale)}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {new Date(2000, m - 1, 1).toLocaleString(locale === 'en' ? 'en' : 'es', {
                    month: 'long',
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => void loadCache(false)}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            {t('common.update')}
          </Button>
          {job?.status === 'running' ? (
            <Button variant="outline" onClick={() => void pauseJob()}>
              <Pause className="h-4 w-4 mr-2" />
              {t('senal.pause')}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => void (job?.status === 'paused' ? resumeJob() : runJob(false))}
            >
              <Play className="h-4 w-4 mr-2" />
              {job?.status === 'paused' ? t('senal.resume') : t('senal.startJob')}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                {t('senal.fromScratch')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('senal.fromScratchTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('senal.fromScratchHint')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void runJob(true)}>
                  {t('senal.fromScratchConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            onClick={downloadReport}
            disabled={!report}
          >
            <Download className="h-4 w-4 mr-2" />
            {t('senal.export')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {job && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
          <Badge
            className={cn(
              'text-[10px]',
              job.status === 'running' && 'bg-sky-700',
              job.status === 'paused' && 'bg-amber-700',
              job.status === 'done' && 'bg-emerald-700'
            )}
          >
            {t(`senal.jobStatus.${job.status}`) || job.status}
          </Badge>
          <span>
            {t('senal.jobDevices')}: {job.devicesSeen}
          </span>
          <span className="text-muted-foreground">
            {t('senal.jobSamples')}: {job.processed}
          </span>
          {(job.lastNombre || job.lastImei) && (
            <span className="text-muted-foreground truncate max-w-[280px]">
              {t('senal.jobLastDevice')}: {job.lastNombre || job.lastImei}
            </span>
          )}
          {job.status === 'running' && (
            <span className="text-muted-foreground w-full sm:w-auto">
              {t('senal.jobLiveHint')}
            </span>
          )}
          {job.error && (
            <span className="text-destructive w-full sm:w-auto">{job.error}</span>
          )}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  {t('senal.kpiWait')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {report.summary.devicesWithWait}
                </div>
                <p className="text-xs text-muted-foreground">
                  {fmtMin(report.summary.totalWaitMin)} · {t('senal.peakHour')}{' '}
                  {String(report.summary.peakWaitHour).padStart(2, '0')}:00
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <WifiOff className="h-3.5 w-3.5 text-red-600" />
                  {t('senal.kpiOffline')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {report.summary.devicesWithOffline}
                </div>
                <p className="text-xs text-muted-foreground">
                  {fmtMin(report.summary.totalOfflineMin)} · {t('senal.peakHour')}{' '}
                  {String(report.summary.peakOfflineHour).padStart(2, '0')}:00
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  {t('senal.kpiStillBad')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {report.summary.devicesStillWaitOrOffline}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.deviceCount} {t('senal.devicesSampled')} ·{' '}
                  {report.sampleCount} samples
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-sky-600" />
                  {t('senal.kpiMapped')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {
                    report.devices.filter(
                      (d) =>
                        d.ubicacion?.pais ||
                        d.ubicacion?.departamento ||
                        d.ubicacion?.zona
                    ).length
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('senal.withGeo')}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('senal.hourlyTitle')}</CardTitle>
              <CardDescription>{t('senal.hourlyHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <HourBars
                wait={report.hourlyWaitMin}
                offline={report.hourlyOfflineMin}
                labelWait={t('senal.wait')}
                labelOffline={t('senal.offline')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base">{t('senal.devicesTitle')}</CardTitle>
                <CardDescription>{t('senal.devicesHint')}</CardDescription>
              </div>
              <Input
                className="max-w-xs"
                placeholder={t('senal.searchPlaceholder')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {loading && !report ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t('common.loading')}
                </p>
              ) : filteredDevices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t('senal.noData')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('senal.deviceName')}</TableHead>
                      <TableHead>IMEI</TableHead>
                      <TableHead>{t('senal.lastDisconnect')}</TableHead>
                      <TableHead>{t('senal.location')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('senal.waitEps')}</TableHead>
                      <TableHead className="text-right">{t('senal.offlineEps')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDevices.map((d) => (
                      <TableRow
                        key={d.imei}
                        className="cursor-pointer"
                        onClick={() => navigate(`/analisis-senal/${d.imei}`)}
                      >
                        <TableCell className="text-sm font-medium">
                          {d.nombre || (
                            <span className="text-muted-foreground font-normal">
                              {t('senal.unnamed')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div>{d.imei}</div>
                          {d.codigo && (
                            <div className="text-muted-foreground">{d.codigo}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          {fmtLima(d.lastDisconnectAt, locale)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[160px]">
                          {[
                            d.ubicacion?.pais,
                            d.ubicacion?.departamento,
                            d.ubicacion?.distrito,
                            d.ubicacion?.zona,
                          ]
                            .filter(Boolean)
                            .join(' · ') || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {statusBadge(d.lastEstado)}
                          {d.neverDisconnected && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {t('senal.neverDisconnected')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.waitEpisodes}
                          {d.waitAvgMin ? (
                            <div className="text-[10px] text-muted-foreground">
                              {fmtMin(d.waitAvgMin)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.offlineEpisodes}
                          {d.offlineAvgMin ? (
                            <div className="text-[10px] text-muted-foreground">
                              {fmtMin(d.offlineAvgMin)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              navigate(`/analisis-senal/${d.imei}`);
                            }}
                          >
                            {t('senal.detail')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!report && loading && (
        <p className="text-sm text-muted-foreground text-center py-12">
          {t('common.loading')}
        </p>
      )}
    </div>
  );
}
