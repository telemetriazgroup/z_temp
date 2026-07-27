import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DispositivoOrigenCodigo } from '../types';
import { useAuth } from '../AuthContext';
import { userIsMonitoreoNavigation } from '../modules/usuario';
import {
  fetchAnalisisMensual,
  runAnalisisMensual,
  patchAnalisisEvento,
  fetchEventoSerie,
  interpolarHuecoEvento,
  analisisExportUrl,
} from '../modules/analisis/analisisApi';
import type {
  AnalisisClasificacion,
  AnalisisCompleto,
  AnalisisEvento,
  AnalisisRangoConfig,
  AnalisisSeriePunto,
} from '../modules/analisis/types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  RefreshCw,
  Play,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Wand2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from './ui/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const EVENTOS_PAGE_SIZE = 10;

interface Props {
  imei: string;
  codigo: DispositivoOrigenCodigo;
  nombreContenedor: string;
  /** Set point actual del equipo (para precargar banda del análisis). */
  setPointInicial?: number | null;
  /** Abre la gráfica principal del historial con el rango del evento (detalle completo). */
  onVerEnGraficaPrincipal?: (rango: {
    since: string;
    until: string;
  }) => void;
}

function defaultBandFromSetPoint(sp: number | null | undefined): {
  setPoint: string;
  bandaMin: string;
  bandaMax: string;
} {
  if (sp == null || Number.isNaN(sp)) {
    return { setPoint: '', bandaMin: '', bandaMax: '' };
  }
  const t = sp === 0 ? 0.5 : Math.abs(sp) * 0.1;
  const min = Math.round((sp - t) * 100) / 100;
  const max = Math.round((sp + t) * 100) / 100;
  return {
    setPoint: String(sp),
    bandaMin: String(min),
    bandaMax: String(max),
  };
}

function fmtDuracion(ev: { durationHours: number; durationMinutes?: number }): string {
  const mins =
    ev.durationMinutes ?? Math.round(ev.durationHours * 60 * 10) / 10;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round((mins % 60) * 10) / 10;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function nowGmt5Parts() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { anio: Number(parts.year), mes: Number(parts.month) };
}

function fmtDt(v: string | null | undefined): string {
  if (v == null) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}

const CLASIFICACIONES: { id: AnalisisClasificacion; label: string }[] = [
  { id: 'sin_clasificar', label: 'Sin clasificar' },
  { id: 'defrost', label: 'DEFROST' },
  { id: 'autorizado', label: 'Autorizado' },
  { id: 'programado', label: 'Programado' },
  { id: 'no_previsto', label: 'No previsto' },
];

const CLASIFICACIONES_ADMIN_EXTRA: {
  id: AnalisisClasificacion;
  label: string;
}[] = [
  { id: 'falso_apagado', label: 'Falso apagado' },
  { id: 'falso_fuera', label: 'Fuera corto (descartado)' },
];

function esFalsoPositivoClasif(c: AnalisisClasificacion | undefined) {
  return c === 'falso_apagado' || c === 'falso_fuera';
}

export function AnalisisTelemetriaPanel({
  imei,
  codigo,
  nombreContenedor,
  setPointInicial = null,
  onVerEnGraficaPrincipal,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.superUser === true;
  const esMonitoreo = userIsMonitoreoNavigation(user);
  /** Contadores técnicos / falsos positivos: solo admin. */
  const mostrarMetaDescarte = isAdmin && !esMonitoreo;
  const [ocultarFalsos, setOcultarFalsos] = useState(false);
  const initial = useMemo(() => nowGmt5Parts(), []);
  const [anio, setAnio] = useState(initial.anio);
  const [mes, setMes] = useState(initial.mes);
  const [data, setData] = useState<AnalisisCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnalisisEvento | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [serie, setSerie] = useState<AnalisisSeriePunto[]>([]);
  const [detalleDraft, setDetalleDraft] = useState('');
  const [clasifDraft, setClasifDraft] =
    useState<AnalisisClasificacion>('sin_clasificar');
  const [eventosPage, setEventosPage] = useState(1);
  const [ocultarDefrost, setOcultarDefrost] = useState(false);
  const initialBand = useMemo(
    () => defaultBandFromSetPoint(setPointInicial),
    [setPointInicial]
  );
  const [setPointDraft, setSetPointDraft] = useState(initialBand.setPoint);
  const [bandaMinDraft, setBandaMinDraft] = useState(initialBand.bandaMin);
  const [bandaMaxDraft, setBandaMaxDraft] = useState(initialBand.bandaMax);
  const [lastMeta, setLastMeta] = useState<AnalisisCompleto['meta']>(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'analizar' | 'regenerar'>(
    'analizar'
  );

  const syncRangoFromSnapshot = useCallback((snap: AnalisisRangoConfig | null | undefined) => {
    if (snap == null) return;
    if (snap.setPoint != null) setSetPointDraft(String(snap.setPoint));
    if (snap.bandaMin != null) setBandaMinDraft(String(snap.bandaMin));
    if (snap.bandaMax != null) setBandaMaxDraft(String(snap.bandaMax));
  }, []);

  const buildRangoPayload = (): AnalisisRangoConfig => {
    const sp = setPointDraft.trim() === '' ? null : Number(setPointDraft);
    const min = bandaMinDraft.trim() === '' ? null : Number(bandaMinDraft);
    const max = bandaMaxDraft.trim() === '' ? null : Number(bandaMaxDraft);
    return {
      useRangoPersonalizado: true,
      setPoint: sp != null && !Number.isNaN(sp) ? sp : null,
      bandaMin: min != null && !Number.isNaN(min) ? min : null,
      bandaMax: max != null && !Number.isNaN(max) ? max : null,
    };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalisisMensual({
        imei,
        codigo,
        anio,
        mes,
        user: user?.username,
        superUser: isAdmin,
      });
      setData(result);
      setSelected(null);
      setDetalleOpen(false);
      setSerie([]);
      setEventosPage(1);
      if (result?.analisis.rangoConfigSnapshot != null) {
        syncRangoFromSnapshot(result.analisis.rangoConfigSnapshot);
      } else {
        const band = defaultBandFromSetPoint(setPointInicial);
        setSetPointDraft(band.setPoint);
        setBandaMinDraft(band.bandaMin);
        setBandaMaxDraft(band.bandaMax);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar análisis');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [imei, codigo, anio, mes, user?.username, isAdmin, setPointInicial, syncRangoFromSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (regenerar = false) => {
    setRunning(true);
    setError(null);
    try {
      const result = await runAnalisisMensual({
        imei,
        codigo,
        anio,
        mes,
        regenerar,
        rangoAnalisis: buildRangoPayload(),
        user: user?.username,
        superUser: isAdmin,
      });
      setData(result);
      setLastMeta(result.meta);
      setSelected(null);
      setDetalleOpen(false);
      setSerie([]);
      setEventosPage(1);
      syncRangoFromSnapshot(
        result.meta?.rangoUsado ?? result.analisis.rangoConfigSnapshot
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar');
    } finally {
      setRunning(false);
    }
  };

  const openEvento = async (ev: AnalisisEvento) => {
    setSelected(ev);
    setDetalleOpen(true);
    setDetalleDraft(ev.detalle ?? '');
    setClasifDraft(ev.clasificacion);
    setSerie([]);
    try {
      const result = await fetchEventoSerie({
        eventoId: ev.id,
        user: user?.username,
        superUser: isAdmin,
      });
      setSerie(result.serie);
    } catch (e) {
      setSerie([]);
      setError(e instanceof Error ? e.message : 'Error al cargar serie');
    }
  };

  const closeDetalle = (open: boolean) => {
    setDetalleOpen(open);
    if (!open) {
      setSelected(null);
      setSerie([]);
    }
  };

  const irAGraficaPrincipal = () => {
    if (selected == null || onVerEnGraficaPrincipal == null) return;
    const until =
      selected.until ?? new Date().toISOString();
    onVerEnGraficaPrincipal({ since: selected.since, until });
    closeDetalle(false);
  };

  const saveClasificacion = async () => {
    if (selected == null) return;
    try {
      const updated = await patchAnalisisEvento({
        eventoId: selected.id,
        clasificacion: clasifDraft,
        detalle: detalleDraft,
        user: user?.username,
        superUser: isAdmin,
      });
      setSelected(updated);
      setData((prev) =>
        prev == null
          ? prev
          : {
              ...prev,
              eventos: prev.eventos.map((e) =>
                e.id === updated.id ? updated : e
              ),
            }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const doInterpolar = async () => {
    if (selected == null || !isAdmin) return;
    try {
      await interpolarHuecoEvento({
        eventoId: selected.id,
        user: user?.username,
        superUser: true,
      });
      await openEvento(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al interpolar');
    }
  };

  const exportPdf = () => {
    if (data == null) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Análisis telemetría — ${nombreContenedor}`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `${data.analisis.codigo} · ${data.analisis.imei} · ${data.analisis.mes}/${data.analisis.anio}`,
      14,
      24
    );
    doc.text(
      isAdmin
        ? `Fuera: ${data.resumen.horasFueraRango} h · Apagado: ${data.resumen.horasApagado} h · DEFROST: ${data.resumen.eventosDefrost ?? 0} ev / ${data.resumen.horasDefrost ?? 0} h · Sin TX: ${data.resumen.horasSinTransmision} h`
        : `Fuera: ${data.resumen.horasFueraRango} h · Apagado: ${data.resumen.horasApagado} h · DEFROST: ${data.resumen.eventosDefrost ?? 0} ev / ${data.resumen.horasDefrost ?? 0} h`,
      14,
      30
    );
    autoTable(doc, {
      startY: 36,
      head: [['Tipo', 'Desde', 'Hasta', 'Horas', 'Clasificación']],
      body: data.eventos.map((e) => [
        e.label,
        fmtDt(e.since),
        fmtDt(e.until),
        fmtDuracion(e),
        e.clasificacion,
      ]),
    });
    doc.save(`analisis_${anio}_${mes}_${imei}.pdf`);
  };

  const download = async (format: 'csv' | 'xlsx') => {
    if (data?.analisis.id == null) return;
    try {
      const url = analisisExportUrl(data.analisis.id, format);
      const res = await fetch(url, {
        headers: {
          ...(user?.username ? { 'X-ZTrack-User': user.username } : {}),
          ...(isAdmin ? { 'X-ZTrack-Super-User': 'true' } : {}),
        },
      });
      if (!res.ok) throw new Error(`Export ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `analisis_${anio}_${mes}_${imei}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar');
    }
  };

  const anios = [initial.anio, initial.anio - 1, initial.anio - 2];

  const chartData = useMemo(
    () =>
      serie.map((p) => ({
        ts: new Date(p.ts).getTime(),
        label: fmtDt(p.ts),
        setPoint: p.set_point ?? null,
        suministro: p.temp_supply_1 ?? null,
        retorno: p.return_air ?? null,
        fuente: p.fuente,
      })),
    [serie]
  );

  const eventosFiltrados = useMemo(() => {
    let all = data?.eventos ?? [];
    if (ocultarDefrost) {
      all = all.filter((e) => e.clasificacion !== 'defrost');
    }
    if (mostrarMetaDescarte && ocultarFalsos) {
      all = all.filter((e) => !esFalsoPositivoClasif(e.clasificacion));
    }
    return all;
  }, [data, ocultarDefrost, ocultarFalsos, mostrarMetaDescarte]);

  const clasificacionesSelect = useMemo(() => {
    if (!mostrarMetaDescarte) return CLASIFICACIONES;
    return [...CLASIFICACIONES, ...CLASIFICACIONES_ADMIN_EXTRA];
  }, [mostrarMetaDescarte]);

  const eventosTotal = eventosFiltrados.length;
  const eventosTotalPaginas = Math.max(
    1,
    Math.ceil(eventosTotal / EVENTOS_PAGE_SIZE) || 1
  );
  const eventosPaginaSegura = Math.min(eventosPage, eventosTotalPaginas);
  const eventosPagina = useMemo(() => {
    const start = (eventosPaginaSegura - 1) * EVENTOS_PAGE_SIZE;
    return eventosFiltrados.slice(start, start + EVENTOS_PAGE_SIZE);
  }, [eventosFiltrados, eventosPaginaSegura]);

  const openConfirm = (mode: 'analizar' | 'regenerar') => {
    setConfirmMode(mode);
    setConfirmOpen(true);
  };

  const confirmAndRun = async () => {
    setConfirmOpen(false);
    await run(confirmMode === 'regenerar');
  };

  const rangoNormalLabel =
    bandaMinDraft && bandaMaxDraft
      ? `${bandaMinDraft} … ${bandaMaxDraft} °C`
      : '—';

  return (
    <Card className="relative">
      {running && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center px-4">
            <p className="font-medium">Cargando análisis…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Rango normal: {rangoNormalLabel}
              {setPointDraft ? ` · SP ${setPointDraft}` : ''}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {confirmMode === 'regenerar'
                ? 'Regenerando el mes completo'
                : 'Procesando telemetría del mes'}
            </p>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmMode === 'regenerar'
                ? 'Regenerar análisis del mes'
                : 'Confirmar análisis del mes'}
            </DialogTitle>
            <DialogDescription>
              Se usará el rango normal indicado. Puede modificarlo antes de
              continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">
              Rango normal a analizar (return air)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="confirm-sp">Set point (°C)</Label>
                <Input
                  id="confirm-sp"
                  type="number"
                  step="0.1"
                  value={setPointDraft}
                  onChange={(e) => setSetPointDraft(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-min">Límite inferior</Label>
                <Input
                  id="confirm-min"
                  type="number"
                  step="0.1"
                  value={bandaMinDraft}
                  onChange={(e) => setBandaMinDraft(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-max">Límite superior</Label>
                <Input
                  id="confirm-max"
                  type="number"
                  step="0.1"
                  value={bandaMaxDraft}
                  onChange={(e) => setBandaMaxDraft(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Rango normal:{' '}
              <span className="font-semibold">{rangoNormalLabel}</span>
              {setPointDraft ? ` (SP ${setPointDraft})` : ''}
            </div>
            <p className="text-xs text-muted-foreground">
              Si desea otro margen (ej. 12–18 en lugar de 14–16), ajústelo aquí
              antes de confirmar.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void confirmAndRun()}>
              {confirmMode === 'regenerar'
                ? 'Regenerar con este rango'
                : 'Analizar con este rango'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">Análisis de telemetría</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(mes)}
              onValueChange={(v) => setMes(Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m.toString().padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(anio)}
              onValueChange={(v) => setAnio(Number(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                {anios.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading || running}
            >
              <RefreshCw
                className={cn('h-4 w-4 mr-1', loading && 'animate-spin')}
              />
              Recargar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error != null && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Rango normal de análisis (return air)</p>
            <p className="text-xs text-muted-foreground">
              {mostrarMetaDescarte
                ? 'Admin: ve todos los eventos (incl. falsos positivos y sin TX)'
                : 'Solo apagado real, fuera de rango y DEFROST'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="analisis-sp">Set point (°C)</Label>
              <Input
                id="analisis-sp"
                type="number"
                step="0.1"
                value={setPointDraft}
                onChange={(e) => setSetPointDraft(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="analisis-min">Límite inferior (°C)</Label>
              <Input
                id="analisis-min"
                type="number"
                step="0.1"
                value={bandaMinDraft}
                onChange={(e) => setBandaMinDraft(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="analisis-max">Límite superior (°C)</Label>
              <Input
                id="analisis-max"
                type="number"
                step="0.1"
                value={bandaMaxDraft}
                onChange={(e) => setBandaMaxDraft(e.target.value)}
                disabled={running}
              />
            </div>
          </div>
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            Rango normal:{' '}
            <span className="font-semibold">{rangoNormalLabel}</span>
            {setPointDraft ? ` · SP ${setPointDraft}` : ''}
          </div>
        </div>

        {data == null && !loading && (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No hay análisis para {String(mes).padStart(2, '0')}/{anio}.
            </p>
            <Button
              type="button"
              onClick={() => openConfirm('analizar')}
              disabled={running}
            >
              <Play className="h-4 w-4 mr-2" />
              Analizar este mes
            </Button>
          </div>
        )}

        {data != null && (
          <>
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div>
                  Analizado desde {fmtDt(data.analisis.analizadoDesde)} · hasta{' '}
                  {fmtDt(data.analisis.analizadoHasta)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Fuera {data.resumen.horasFueraRango} h
                  </Badge>
                  <Badge variant="outline">
                    Apagado {data.resumen.horasApagado} h
                  </Badge>
                  <Badge className="bg-sky-600 hover:bg-sky-600">
                    DEFROST {data.resumen.eventosDefrost ?? 0} ev ·{' '}
                    {data.resumen.horasDefrost ?? 0} h
                  </Badge>
                  {isAdmin && (
                    <Badge variant="outline">
                      Sin TX {data.resumen.horasSinTransmision} h
                    </Badge>
                  )}
                  {mostrarMetaDescarte &&
                    (data.resumen.eventosFalsoApagado != null ||
                      data.resumen.eventosFalsoFuera != null) && (
                      <Badge variant="secondary">
                        Falsos: apagado {data.resumen.eventosFalsoApagado ?? 0}{' '}
                        ({data.resumen.horasFalsoApagado ?? 0} h) · fuera corto{' '}
                        {data.resumen.eventosFalsoFuera ?? 0} (
                        {data.resumen.horasFalsoFuera ?? 0} h)
                      </Badge>
                    )}
                  <Badge>{data.analisis.estado}</Badge>
                  {data.analisis.rangoConfigSnapshot?.label != null && (
                    <Badge variant="secondary">
                      Rango {data.analisis.rangoConfigSnapshot.label}
                    </Badge>
                  )}
                  {mostrarMetaDescarte &&
                    (lastMeta?.falsosApagadoDescartados ??
                      data.analisis.rangoConfigSnapshot
                        ?.falsosApagadoDescartados) != null && (
                      <Badge variant="outline">
                        Falsos apagado &lt;8 min:{' '}
                        {lastMeta?.falsosApagadoDescartados ??
                          data.analisis.rangoConfigSnapshot
                            ?.falsosApagadoDescartados}
                      </Badge>
                    )}
                  {mostrarMetaDescarte &&
                    (lastMeta?.falsosApagadoPorSuministro ??
                      data.analisis.rangoConfigSnapshot
                        ?.falsosApagadoPorSuministro) != null && (
                      <Badge variant="outline">
                        Falsos apagado (suministro≈SP):{' '}
                        {lastMeta?.falsosApagadoPorSuministro ??
                          data.analisis.rangoConfigSnapshot
                            ?.falsosApagadoPorSuministro}{' '}
                        pts
                      </Badge>
                    )}
                  {mostrarMetaDescarte &&
                    (lastMeta?.fueraRangoCortosDescartados ??
                      data.analisis.rangoConfigSnapshot
                        ?.fueraRangoCortosDescartados) != null && (
                      <Badge variant="outline">
                        Fuera de rango &lt;30 min descartados:{' '}
                        {lastMeta?.fueraRangoCortosDescartados ??
                          data.analisis.rangoConfigSnapshot
                            ?.fueraRangoCortosDescartados}
                      </Badge>
                    )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openConfirm('analizar')}
                  disabled={running}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Actualizar
                </Button>
                {isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => openConfirm('regenerar')}
                    disabled={running}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Regenerar mes
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={exportPdf}
                  disabled={running}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void download('csv')}
                  disabled={running}
                >
                  CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void download('xlsx')}
                  disabled={running}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Excel
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead>Hasta</TableHead>
                    <TableHead>Fuera</TableHead>
                    <TableHead>Apagado</TableHead>
                    <TableHead>DEFROST</TableHead>
                    {isAdmin && <TableHead>Sin TX</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.semanas.map((s) => (
                    <TableRow key={s.semanaIndex}>
                      <TableCell>S{s.semanaIndex}</TableCell>
                      <TableCell className="text-xs">{fmtDt(s.desde)}</TableCell>
                      <TableCell className="text-xs">{fmtDt(s.hasta)}</TableCell>
                      <TableCell>{s.horasFueraRango} h</TableCell>
                      <TableCell>{s.horasApagado} h</TableCell>
                      <TableCell>
                        {s.eventosDefrost ?? 0} ev · {s.horasDefrost ?? 0} h
                      </TableCell>
                      {isAdmin && (
                        <TableCell>{s.horasSinTransmision} h</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-sm font-medium">
                  Eventos
                  {!mostrarMetaDescarte && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (operativos)
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {mostrarMetaDescarte && (
                    <Button
                      type="button"
                      size="sm"
                      variant={ocultarFalsos ? 'default' : 'outline'}
                      onClick={() => {
                        setOcultarFalsos((v) => !v);
                        setEventosPage(1);
                        setSelected(null);
                        setDetalleOpen(false);
                      }}
                    >
                      {ocultarFalsos
                        ? 'Mostrar falsos positivos'
                        : 'Ocultar falsos positivos'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={ocultarDefrost ? 'default' : 'outline'}
                    onClick={() => {
                      setOcultarDefrost((v) => !v);
                      setEventosPage(1);
                      setSelected(null);
                      setDetalleOpen(false);
                    }}
                    title={
                      ocultarDefrost
                        ? 'Mostrar también eventos DEFROST'
                        : 'Ocultar eventos DEFROST de la lista'
                    }
                  >
                    {ocultarDefrost ? 'Mostrar DEFROST' : 'Filtrar sin DEFROST'}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Clasificación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventosTotal === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          {ocultarDefrost
                            ? 'Sin eventos (filtro sin DEFROST activo).'
                            : 'Sin eventos en el periodo analizado.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {eventosPagina.map((ev) => (
                      <TableRow
                        key={ev.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50',
                          selected?.id === ev.id && 'bg-muted/60'
                        )}
                        onClick={() => void openEvento(ev)}
                      >
                        <TableCell>
                          <Badge
                            variant={
                              esFalsoPositivoClasif(ev.clasificacion)
                                ? 'secondary'
                                : ev.tipo === 'fuera_rango' &&
                                    ev.clasificacion !== 'defrost'
                                  ? 'destructive'
                                  : 'outline'
                            }
                            className={
                              ev.clasificacion === 'defrost'
                                ? 'bg-sky-600 hover:bg-sky-600 text-white'
                                : undefined
                            }
                          >
                            {ev.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDt(ev.since)}</TableCell>
                        <TableCell className="text-xs">{fmtDt(ev.until)}</TableCell>
                        <TableCell>{fmtDuracion(ev)}</TableCell>
                      <TableCell className="text-xs">
                        {ev.clasificacion === 'defrost' ? (
                          <Badge className="bg-sky-600 hover:bg-sky-600">DEFROST</Badge>
                        ) : esFalsoPositivoClasif(ev.clasificacion) ? (
                          <Badge variant="secondary">
                            {ev.clasificacion === 'falso_apagado'
                              ? 'Falso apagado'
                              : 'Fuera corto'}
                          </Badge>
                        ) : (
                          ev.clasificacion
                        )}
                      </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {eventosTotal > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground px-1">
                  <span>
                    {(eventosPaginaSegura - 1) * EVENTOS_PAGE_SIZE + 1}–
                    {Math.min(
                      eventosPaginaSegura * EVENTOS_PAGE_SIZE,
                      eventosTotal
                    )}{' '}
                    de {eventosTotal}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={eventosPaginaSegura <= 1}
                      onClick={() =>
                        setEventosPage((p) => Math.max(1, p - 1))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span>
                      Página {eventosPaginaSegura} / {eventosTotalPaginas}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={eventosPaginaSegura >= eventosTotalPaginas}
                      onClick={() =>
                        setEventosPage((p) =>
                          Math.min(eventosTotalPaginas, p + 1)
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Dialog open={detalleOpen} onOpenChange={closeDetalle}>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                {selected != null && (
                  <>
                    <DialogHeader>
                      <DialogTitle>
                        Detalle · {selected.label}
                      </DialogTitle>
                      <DialogDescription>
                        Gráfica resumida por hora ({fmtDt(selected.since)} –{' '}
                        {fmtDt(selected.until)}). Para ver todos los puntos del
                        evento use la gráfica principal.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Clasificación</Label>
                          <Select
                            value={clasifDraft}
                            onValueChange={(v) =>
                              setClasifDraft(v as AnalisisClasificacion)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {clasificacionesSelect.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Detalle</Label>
                          <Textarea
                            value={detalleDraft}
                            onChange={(e) => setDetalleDraft(e.target.value)}
                            rows={4}
                            placeholder="Motivo, orden de trabajo, observaciones…"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void saveClasificacion()}
                          >
                            Guardar clasificación
                          </Button>
                          {isAdmin && selected.tipo === 'sin_transmision' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void doInterpolar()}
                            >
                              <Wand2 className="h-4 w-4 mr-1" />
                              Interpolar hueco (PLI+LOCF)
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="h-[280px]">
                        {chartData.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-10 text-center">
                            Sin puntos horarios en este rango.
                          </p>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="ts"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(v) =>
                                  new Date(v).toLocaleString('es-PE', {
                                    timeZone: 'America/Lima',
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                }
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip
                                labelFormatter={(v) =>
                                  fmtDt(new Date(Number(v)).toISOString())
                                }
                              />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="setPoint"
                                name="SetPoint"
                                stroke="#FDD835"
                                dot={false}
                                connectNulls
                              />
                              <Line
                                type="monotone"
                                dataKey="suministro"
                                name="Suministro"
                                stroke="#1B5E20"
                                dot={false}
                                connectNulls
                              />
                              <Line
                                type="monotone"
                                dataKey="retorno"
                                name="Retorno"
                                stroke="#E53935"
                                dot={false}
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      {onVerEnGraficaPrincipal != null && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={irAGraficaPrincipal}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver en gráfica principal
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => closeDetalle(false)}
                      >
                        Cerrar
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
