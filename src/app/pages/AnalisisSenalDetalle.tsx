import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  createSenalEvento,
  deleteSenalEvento,
  fetchSenalDeviceHistory,
  saveSenalUbicacion,
  type SenalDeviceHistory,
  type SenalEpisode,
  type SenalEvento,
  type SenalTelemetry,
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
import { ArrowLeft, MapPin, Plus, RadioTower, Trash2 } from 'lucide-react';
import { cn } from '../components/ui/utils';

const EVENT_TIPOS = [
  'corte_energia',
  'sin_cobertura',
  'mantenimiento',
  'traslado',
  'puerto',
  'clima',
  'otro',
] as const;

const TELEMETRY_FIELDS: { key: keyof SenalTelemetry; labelKey: string }[] = [
  { key: 'set_point', labelKey: 'senal.fieldSet' },
  { key: 'temp_supply_1', labelKey: 'senal.fieldSupply' },
  { key: 'return_air', labelKey: 'senal.fieldReturn' },
  { key: 'cargo_1_temp', labelKey: 'senal.fieldUsda1' },
  { key: 'cargo_2_temp', labelKey: 'senal.fieldUsda2' },
  { key: 'cargo_3_temp', labelKey: 'senal.fieldUsda3' },
  { key: 'power_state', labelKey: 'senal.fieldPower' },
];

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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTelemetryValue(key: keyof SenalTelemetry, snap: SenalTelemetry | null | undefined) {
  if (!snap) return '—';
  if (key === 'power_state') {
    const txt = snap.power_state_texto;
    if (txt === 'on' || txt === 'off') return txt.toUpperCase();
    const raw = snap.power_state;
    if (raw === 1 || raw === '1' || raw === 'on') return 'ON';
    if (raw === 0 || raw === '0' || raw === 'off') return 'OFF';
    return raw == null || raw === '' ? '—' : String(raw);
  }
  const n = snap[key];
  if (n == null || n === '') return '—';
  const num = Number(n);
  return Number.isFinite(num) ? `${num.toFixed(1)} °C` : String(n);
}

function statusBadge(estado: string | null) {
  const s = String(estado ?? '').toLowerCase();
  if (s === 'online')
    return <Badge className="bg-emerald-600 text-[10px] h-5">online</Badge>;
  if (s === 'wait')
    return <Badge className="bg-amber-600 text-[10px] h-5">wait</Badge>;
  if (s === 'offline')
    return <Badge variant="destructive" className="text-[10px] h-5">offline</Badge>;
  return <Badge variant="secondary" className="text-[10px] h-5">{s || '—'}</Badge>;
}

type Props = {
  imei: string;
  username: string;
};

export function AnalisisSenalDetalle({ imei, username }: Props) {
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [history, setHistory] = useState<SenalDeviceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUbi, setSavingUbi] = useState(false);
  const [savingEvento, setSavingEvento] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [ubiForm, setUbiForm] = useState({
    pais: '',
    departamento: '',
    provincia: '',
    distrito: '',
    zona: '',
    observaciones: '',
  });

  const [eventoForm, setEventoForm] = useState({
    tipo: 'otro',
    titulo: '',
    nota: '',
    occurredAt: '',
    episodioId: '' as string,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSenalDeviceHistory({
        imei,
        username,
        superUser: true,
      });
      setHistory(data);
      const first = data.episodes[0];
      setExpanded(first ? `${lazoKey(first)}-0` : null);
      setUbiForm({
        pais: data.ubicacion?.pais ?? '',
        departamento: data.ubicacion?.departamento ?? '',
        provincia: data.ubicacion?.provincia ?? '',
        distrito: data.ubicacion?.distrito ?? '',
        zona: data.ubicacion?.zona ?? '',
        observaciones: data.ubicacion?.observaciones ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.loadError'));
      setHistory(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imei, username]);

  const eventsByLazo = useMemo(() => {
    const map = new Map<string, SenalEvento[]>();
    const episodes = history?.episodes ?? [];
    for (const ev of history?.eventos ?? []) {
      if (ev.episodioId == null) continue;
      const lazo = episodes.find((e) =>
        (e.episodioIds ?? []).some((id) => String(id) === String(ev.episodioId))
        || String(e.id) === String(ev.episodioId)
        || String(e.lazoId) === String(ev.episodioId)
      );
      const key = String(lazo?.lazoId ?? lazo?.id ?? ev.episodioId);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [history]);

  const waitLazos = useMemo(
    () => (history?.episodes ?? []).filter((e) => e.tipo === 'wait'),
    [history]
  );
  const offlineLazos = useMemo(
    () => (history?.episodes ?? []).filter((e) => e.tipo === 'offline'),
    [history]
  );

  const saveUbi = async () => {
    setSavingUbi(true);
    setError(null);
    try {
      const saved = await saveSenalUbicacion(
        imei,
        { ...ubiForm, codigo: history?.codigo ?? undefined },
        username,
        true
      );
      setHistory((prev) => (prev ? { ...prev, ubicacion: saved } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.saveError'));
    } finally {
      setSavingUbi(false);
    }
  };

  const saveEvento = async () => {
    setSavingEvento(true);
    setError(null);
    try {
      const created = await createSenalEvento(
        {
          imei,
          tipo: eventoForm.tipo,
          titulo: eventoForm.titulo.trim() || undefined,
          nota: eventoForm.nota.trim() || undefined,
          occurredAt: eventoForm.occurredAt
            ? new Date(eventoForm.occurredAt).toISOString()
            : undefined,
          episodioId: eventoForm.episodioId ? Number(eventoForm.episodioId) : undefined,
        },
        username,
        true
      );
      setHistory((prev) =>
        prev ? { ...prev, eventos: [created, ...prev.eventos] } : prev
      );
      setEventoForm({
        tipo: 'otro',
        titulo: '',
        nota: '',
        occurredAt: '',
        episodioId: '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.eventSaveError'));
    } finally {
      setSavingEvento(false);
    }
  };

  const removeEvento = async (ev: SenalEvento) => {
    try {
      await deleteSenalEvento(ev.id, imei, username, true);
      setHistory((prev) =>
        prev
          ? { ...prev, eventos: prev.eventos.filter((x) => x.id !== ev.id) }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('senal.eventSaveError'));
    }
  };

  const title = history?.nombre || imei;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 -ml-2"
            onClick={() => navigate('/analisis-senal')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <RadioTower className="h-7 w-7 text-sky-600" />
            {title}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {imei}
            {history?.codigo ? ` · ${history.codigo}` : ''}
            {history?.nombre ? ` · ${t('senal.deviceName')}: ${history.nombre}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {statusBadge(history?.lastEstado ?? null)}
            {history?.lastDisconnectAt && (
              <span className="text-xs text-muted-foreground">
                {t('senal.lastDisconnect')}: {fmtLima(history.lastDisconnectAt, locale)}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !history && (
        <p className="text-sm text-muted-foreground text-center py-12">
          {t('common.loading')}
        </p>
      )}

      {history && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('senal.historyTitle')}</CardTitle>
              <CardDescription>{t('senal.historyHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {history.episodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('senal.noEpisodes')}</p>
              ) : (
                <>
                  <LazoSector
                    title={t('senal.sectorWait')}
                    hint={t('senal.sectorWaitHint')}
                    empty={t('senal.noWaitLazos')}
                    lazos={waitLazos}
                    eventsByLazo={eventsByLazo}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    locale={locale}
                    t={t}
                  />
                  <LazoSector
                    title={t('senal.sectorOffline')}
                    hint={t('senal.sectorOfflineHint')}
                    empty={t('senal.noOfflineLazos')}
                    lazos={offlineLazos}
                    eventsByLazo={eventsByLazo}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    locale={locale}
                    t={t}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('senal.eventsTitle')}</CardTitle>
                <CardDescription>{t('senal.eventsHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs">{t('senal.eventType')}</Label>
                    <Select
                      value={eventoForm.tipo}
                      onValueChange={(v) =>
                        setEventoForm((f) => ({ ...f, tipo: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TIPOS.map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {t(`senal.eventTypes.${tipo}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs">{t('senal.eventWhen')}</Label>
                    <Input
                      type="datetime-local"
                      value={eventoForm.occurredAt}
                      onChange={(e) =>
                        setEventoForm((f) => ({ ...f, occurredAt: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t('senal.eventLazo')}</Label>
                    <Select
                      value={eventoForm.episodioId || 'none'}
                      onValueChange={(v) =>
                        setEventoForm((f) => ({
                          ...f,
                          episodioId: v === 'none' ? '' : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('senal.eventRangeNone')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('senal.eventRangeNone')}</SelectItem>
                        {history.episodes
                          .filter((e) => {
                            const id = e.lazoId ?? e.id;
                            return id != null && Number.isFinite(Number(id));
                          })
                          .map((e) => (
                            <SelectItem
                              key={String(e.lazoId ?? e.id)}
                              value={String(e.lazoId ?? e.id)}
                            >
                              {e.tipo} · {fmtMin(e.durationMin)} ·{' '}
                              {fmtLima(e.startedAt, locale)} →{' '}
                              {fmtLima(e.endedAt, locale)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t('senal.eventTitle')}</Label>
                    <Input
                      value={eventoForm.titulo}
                      onChange={(e) =>
                        setEventoForm((f) => ({ ...f, titulo: e.target.value }))
                      }
                      placeholder={t('senal.eventTitlePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">{t('senal.eventNote')}</Label>
                    <Textarea
                      rows={2}
                      value={eventoForm.nota}
                      onChange={(e) =>
                        setEventoForm((f) => ({ ...f, nota: e.target.value }))
                      }
                      placeholder={t('senal.eventNotePlaceholder')}
                    />
                  </div>
                </div>
                <Button onClick={() => void saveEvento()} disabled={savingEvento}>
                  <Plus className="h-4 w-4 mr-1" />
                  {savingEvento ? t('common.saving') : t('senal.addEvent')}
                </Button>

                <ul className="divide-y rounded-md border">
                  {history.eventos.length === 0 ? (
                    <li className="p-3 text-sm text-muted-foreground">
                      {t('senal.noEvents')}
                    </li>
                  ) : (
                    history.eventos.map((ev) => (
                      <li
                        key={ev.id}
                        className="px-3 py-2 flex items-start justify-between gap-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {t(`senal.eventTypes.${ev.tipo}`) || ev.tipo}
                            {ev.titulo ? ` · ${ev.titulo}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtLima(ev.occurredAt, locale)}
                            {ev.createdBy ? ` · ${ev.createdBy}` : ''}
                          </div>
                          {ev.nota && (
                            <p className="text-xs mt-1 whitespace-pre-wrap">{ev.nota}</p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void removeEvento(ev)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {t('senal.geoTitle')}
                </CardTitle>
                <CardDescription>{t('senal.geoHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                        setUbiForm((f) => ({ ...f, departamento: e.target.value }))
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
                <Button onClick={() => void saveUbi()} disabled={savingUbi}>
                  {savingUbi ? t('common.saving') : t('senal.saveLocation')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function lazoKey(e: SenalEpisode): string {
  return String(e.lazoId ?? e.id ?? e.startedAt);
}

function LazoSector({
  title,
  hint,
  empty,
  lazos,
  eventsByLazo,
  expanded,
  setExpanded,
  locale,
  t,
}: {
  title: string;
  hint: string;
  empty: string;
  lazos: SenalEpisode[];
  eventsByLazo: Map<string, SenalEvento[]>;
  expanded: string | null;
  setExpanded: (fn: (cur: string | null) => string | null) => void;
  locale: string;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {lazos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        lazos.map((e, i) => {
          const key = `${lazoKey(e)}-${i}`;
          return (
            <EpisodeCard
              key={key}
              episode={e}
              events={eventsByLazo.get(lazoKey(e)) ?? []}
              expanded={expanded === key}
              onToggle={() =>
                setExpanded((cur) => (cur === key ? null : key))
              }
              locale={locale}
              t={t}
            />
          );
        })
      )}
    </div>
  );
}

function EpisodeCard({
  episode,
  events,
  expanded,
  onToggle,
  locale,
  t,
}: {
  episode: SenalEpisode;
  events: SenalEvento[];
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full text-left px-3 py-2 flex flex-wrap items-center justify-between gap-2"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 text-sm">
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px]',
              episode.tipo === 'wait' ? 'bg-amber-100' : 'bg-red-100'
            )}
          >
            {episode.tipo}
          </Badge>
          <span>
            {fmtLima(episode.startedAt, locale)} → {fmtLima(episode.endedAt, locale)}
          </span>
          {episode.open && (
            <Badge variant="outline" className="text-[10px]">
              {t('senal.open')}
            </Badge>
          )}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {fmtMin(episode.durationMin)}
          {episode.recovered ? '' : ` · ${t('senal.notRecovered')}`}
        </span>
      </button>
      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('senal.field')}</TableHead>
                <TableHead>{t('senal.lastConnected')}</TableHead>
                <TableHead>{t('senal.recoveredAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TELEMETRY_FIELDS.map((f) => (
                <TableRow key={f.key}>
                  <TableCell className="text-xs font-medium">{t(f.labelKey)}</TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {fmtTelemetryValue(f.key, episode.datosInicio)}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {episode.open
                      ? '—'
                      : fmtTelemetryValue(f.key, episode.datosFin)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(episode.datosInicio?.capturedAt || episode.datosFin?.capturedAt) && (
            <p className="text-[11px] text-muted-foreground">
              {t('senal.sampleAt')}: {fmtLima(episode.datosInicio?.capturedAt, locale)}
              {episode.datosFin?.capturedAt
                ? ` → ${fmtLima(episode.datosFin.capturedAt, locale)}`
                : ''}
            </p>
          )}
          {events.length > 0 && (
            <div className="text-xs space-y-1">
              <p className="font-medium">{t('senal.eventsOnRange')}</p>
              {events.map((ev) => (
                <p key={ev.id}>
                  {t(`senal.eventTypes.${ev.tipo}`) || ev.tipo}
                  {ev.titulo ? ` · ${ev.titulo}` : ''}
                  {' · '}
                  {fmtLima(ev.occurredAt, locale)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
