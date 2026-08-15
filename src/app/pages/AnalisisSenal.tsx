import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import {
  fetchSenalBehavior,
  saveSenalUbicacion,
  type SenalBehaviorReport,
  type SenalDeviceBehavior,
} from '../modules/senal';
import { useLocale } from '../i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  RadioTower,
  RefreshCw,
  Download,
  MapPin,
  Clock,
  WifiOff,
  Activity,
} from 'lucide-react';
import { cn } from '../components/ui/utils';

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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
  const isSuper = userIsSuperAdmin(user);

  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<SenalBehaviorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SenalDeviceBehavior | null>(null);
  const [savingUbi, setSavingUbi] = useState(false);

  const [ubiForm, setUbiForm] = useState({
    pais: '',
    departamento: '',
    provincia: '',
    distrito: '',
    zona: '',
    observaciones: '',
  });

  const load = useCallback(async () => {
    if (!user?.username || !isSuper) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSenalBehavior({
        anio,
        mes,
        username: user.username,
        superUser: true,
      });
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.loadError'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [user?.username, isSuper, anio, mes, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDevices = useMemo(() => {
    if (!report) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return report.devices;
    return report.devices.filter((d) => {
      const ubi = d.ubicacion;
      return (
        d.imei.toLowerCase().includes(q) ||
        (d.codigo ?? '').toLowerCase().includes(q) ||
        (ubi?.pais ?? '').toLowerCase().includes(q) ||
        (ubi?.departamento ?? '').toLowerCase().includes(q) ||
        (ubi?.distrito ?? '').toLowerCase().includes(q) ||
        (ubi?.zona ?? '').toLowerCase().includes(q)
      );
    });
  }, [report, filter]);

  const openDetail = (d: SenalDeviceBehavior) => {
    setSelected(d);
    setUbiForm({
      pais: d.ubicacion?.pais ?? '',
      departamento: d.ubicacion?.departamento ?? '',
      provincia: d.ubicacion?.provincia ?? '',
      distrito: d.ubicacion?.distrito ?? '',
      zona: d.ubicacion?.zona ?? '',
      observaciones: d.ubicacion?.observaciones ?? '',
    });
  };

  const saveUbi = async () => {
    if (!selected || !user?.username) return;
    setSavingUbi(true);
    setError(null);
    try {
      const saved = await saveSenalUbicacion(
        selected.imei,
        { ...ubiForm, codigo: selected.codigo ?? undefined },
        user.username,
        true
      );
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: prev.devices.map((d) =>
            d.imei === selected.imei ? { ...d, ubicacion: saved } : d
          ),
        };
      });
      setSelected((prev) => (prev ? { ...prev, ubicacion: saved } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.saveError'));
    } finally {
      setSavingUbi(false);
    }
  };

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
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            {t('common.update')}
          </Button>
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
                      <TableHead>IMEI</TableHead>
                      <TableHead>{t('senal.location')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('senal.waitEps')}</TableHead>
                      <TableHead className="text-right">{t('senal.waitAvg')}</TableHead>
                      <TableHead className="text-right">{t('senal.offlineEps')}</TableHead>
                      <TableHead className="text-right">{t('senal.offlineAvg')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDevices.map((d) => (
                      <TableRow key={d.imei}>
                        <TableCell className="font-mono text-xs">
                          <div>{d.imei}</div>
                          {d.codigo && (
                            <div className="text-muted-foreground">{d.codigo}</div>
                          )}
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
                        <TableCell>{statusBadge(d.lastEstado)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.waitEpisodes}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {d.waitAvgMin ? fmtMin(d.waitAvgMin) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.offlineEpisodes}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {d.offlineAvgMin ? fmtMin(d.offlineAvgMin) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDetail(d)}
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

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('senal.detailTitle')}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {selected?.imei}
              {selected?.codigo ? ` · ${selected.codigo}` : ''}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">{t('senal.wait')}</div>
                  <div className="font-medium">
                    {selected.waitEpisodes} · avg {fmtMin(selected.waitAvgMin)}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">{t('senal.offline')}</div>
                  <div className="font-medium">
                    {selected.offlineEpisodes} · avg{' '}
                    {fmtMin(selected.offlineAvgMin)}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">{t('senal.episodes')}</Label>
                <ul className="mt-1 max-h-36 overflow-y-auto border rounded-md divide-y text-xs">
                  {selected.episodes.length === 0 ? (
                    <li className="p-2 text-muted-foreground">{t('senal.noEpisodes')}</li>
                  ) : (
                    selected.episodes.slice(0, 40).map((e, i) => (
                      <li key={`${e.startedAt}-${i}`} className="px-2 py-1.5 flex justify-between gap-2">
                        <span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] mr-1',
                              e.tipo === 'wait' ? 'bg-amber-100' : 'bg-red-100'
                            )}
                          >
                            {e.tipo}
                          </Badge>
                          {String(e.startHour).padStart(2, '0')}:00 →{' '}
                          {String(e.endHour).padStart(2, '0')}:00
                          {e.recovered ? '' : e.open ? ' (open)' : ''}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {fmtMin(e.durationMin)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('senal.geoTitle')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('senal.country')}</Label>
                    <Input
                      value={ubiForm.pais}
                      onChange={(e) =>
                        setUbiForm((f) => ({ ...f, pais: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('senal.department')}</Label>
                    <Input
                      value={ubiForm.departamento}
                      onChange={(e) =>
                        setUbiForm((f) => ({
                          ...f,
                          departamento: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('senal.province')}</Label>
                    <Input
                      value={ubiForm.provincia}
                      onChange={(e) =>
                        setUbiForm((f) => ({ ...f, provincia: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('senal.district')}</Label>
                    <Input
                      value={ubiForm.distrito}
                      onChange={(e) =>
                        setUbiForm((f) => ({ ...f, distrito: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t('senal.zone')}</Label>
                    <Input
                      value={ubiForm.zona}
                      onChange={(e) =>
                        setUbiForm((f) => ({ ...f, zona: e.target.value }))
                      }
                      placeholder={t('senal.zonePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t('senal.observations')}</Label>
                    <Textarea
                      rows={3}
                      value={ubiForm.observaciones}
                      onChange={(e) =>
                        setUbiForm((f) => ({
                          ...f,
                          observaciones: e.target.value,
                        }))
                      }
                      placeholder={t('senal.observationsPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveUbi()} disabled={savingUbi}>
              {savingUbi ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
