import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBuscarDatosOficiales } from '../api/datosOficiales';
import type { BuscarDatosOficialesResponse, DispositivoOrigenCodigo } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { cn } from './ui/utils';
import { ReporteInternoModal } from './ReporteInternoModal';
import { ReporteCaModal } from './ReporteCaModal';
import {
  datosAGrafica,
  ordenarTablaDesc,
  rangoUltimasHorasDatetimeLocal,
  dateToDatetimeLocalValue,
  TABLA_HISTORIAL_COLUMNAS,
  celdaHistorial,
  claveFilaHistorial,
} from '../lib/historialOficial';
import type { HistorialExportRango } from '../lib/exportHistorial';
import {
  exportHistorialCsv,
  exportHistorialPdf,
  exportHistorialXlsx,
  exportHistorialJson,
} from '../lib/exportHistorial';
import { useAuth } from '../AuthContext';
import { HistorialReeferChart } from './HistorialReeferChart';
import {
  RefreshCw,
  FileSpreadsheet,
  FileText,
  FileType2,
  Search,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  Braces,
  FlaskConical,
} from 'lucide-react';

const HORAS_DEFECTO = 12;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type HistorialFocusRango = {
  /** Cambia en cada solicitud para re-disparar el efecto. */
  token: number;
  desdeIso: string;
  hastaIso: string;
};

interface Props {
  imei: string;
  codigo: DispositivoOrigenCodigo;
  /** Nombre local o etiqueta; si no hay, suele ser el IMEI. */
  nombreContenedor: string;
  /** Layout compacto junto al panel de control IFF. */
  embedded?: boolean;
  defaultTab?: 'datos' | 'grafica';
  /** Solicitud externa para cargar un rango (p. ej. desde un evento de análisis). */
  focusRango?: HistorialFocusRango | null;
  /** id del contenedor para scrollIntoView. */
  sectionId?: string;
}

function parseDatetimeLocal(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function HistorialOficialDetalle({
  imei,
  codigo,
  nombreContenedor,
  embedded = false,
  defaultTab = 'datos',
  focusRango = null,
  sectionId = 'historial-oficial',
}: Props) {
  const { user } = useAuth();
  const esSuperUser = user?.superUser === true;
  const [reporteInternoOpen, setReporteInternoOpen] = useState(false);
  const [reporteCaOpen, setReporteCaOpen] = useState(false);
  const initRango = rangoUltimasHorasDatetimeLocal(HORAS_DEFECTO);
  const [desdeStr, setDesdeStr] = useState(initRango.desde);
  const [hastaStr, setHastaStr] = useState(initRango.hasta);
  const [tab, setTab] = useState<'datos' | 'grafica'>(defaultTab);

  const [respuesta, setRespuesta] = useState<BuscarDatosOficialesResponse | null>(
    null
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [exportError, setExportError] = useState<string | null>(null);

  const ejecutarBusqueda = useCallback(async () => {
    const fi = parseDatetimeLocal(desdeStr);
    const ff = parseDatetimeLocal(hastaStr);
    if (fi == null || ff == null) {
      setError('Indique fechas válidas.');
      return false;
    }
    if (fi.getTime() >= ff.getTime()) {
      setError('La fecha inicial debe ser anterior a la fecha final.');
      return false;
    }

    setError(null);
    setCargando(true);
    try {
      const r = await fetchBuscarDatosOficiales(codigo, imei, {
        fechaInicial: fi,
        fechaFinal: ff,
      });
      setRespuesta(r);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar historial');
      setRespuesta(null);
      return false;
    } finally {
      setCargando(false);
    }
  }, [codigo, imei, desdeStr, hastaStr]);

  useEffect(() => {
    const rango = rangoUltimasHorasDatetimeLocal(HORAS_DEFECTO);
    setDesdeStr(rango.desde);
    setHastaStr(rango.hasta);

    let cancelled = false;
    (async () => {
      const fi = parseDatetimeLocal(rango.desde);
      const ff = parseDatetimeLocal(rango.hasta);
      if (fi == null || ff == null) return;

      setCargando(true);
      setError(null);
      try {
        const res = await fetchBuscarDatosOficiales(codigo, imei, {
          fechaInicial: fi,
          fechaFinal: ff,
        });
        if (!cancelled) setRespuesta(res);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Error al cargar historial'
          );
          setRespuesta(null);
        }
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [codigo, imei]);

  useEffect(() => {
    setPage(1);
  }, [respuesta?.data.datos.length, pageSize]);

  useEffect(() => {
    if (focusRango == null) return;
    const fi = new Date(focusRango.desdeIso);
    const ff = new Date(focusRango.hastaIso);
    if (Number.isNaN(fi.getTime()) || Number.isNaN(ff.getTime())) return;
    if (fi.getTime() >= ff.getTime()) return;

    const desde = dateToDatetimeLocalValue(fi);
    const hasta = dateToDatetimeLocalValue(ff);
    setDesdeStr(desde);
    setHastaStr(hasta);
    setTab('grafica');
    setPage(1);

    let cancelled = false;
    (async () => {
      setError(null);
      setCargando(true);
      try {
        const r = await fetchBuscarDatosOficiales(codigo, imei, {
          fechaInicial: fi,
          fechaFinal: ff,
        });
        if (!cancelled) setRespuesta(r);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Error al cargar historial'
          );
          setRespuesta(null);
        }
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();

    requestAnimationFrame(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      cancelled = true;
    };
  }, [focusRango, codigo, imei, sectionId]);

  const datosCompletos = respuesta?.data.datos ?? [];
  const filasTabla = useMemo(
    () => ordenarTablaDesc(datosCompletos),
    [datosCompletos]
  );
  const totalFilas = filasTabla.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / pageSize) || 1);
  const paginaSegura = Math.min(page, totalPaginas);
  const inicioSlice = (paginaSegura - 1) * pageSize;
  const filasPagina = filasTabla.slice(inicioSlice, inicioSlice + pageSize);

  const chartData = useMemo(() => datosAGrafica(datosCompletos), [datosCompletos]);

  const sinRegistrosApi =
    !cargando && respuesta != null && datosCompletos.length === 0;

  const rangoExport = useMemo((): HistorialExportRango | null => {
    const a = parseDatetimeLocal(desdeStr);
    const b = parseDatetimeLocal(hastaStr);
    if (a != null && b != null && a.getTime() < b.getTime()) {
      return { desde: a, hasta: b };
    }
    if (respuesta?.data?.fecha_inicial != null && respuesta?.data?.fecha_final != null) {
      const d1 = new Date(respuesta.data.fecha_inicial);
      const d2 = new Date(respuesta.data.fecha_final);
      if (
        !Number.isNaN(d1.getTime()) &&
        !Number.isNaN(d2.getTime()) &&
        d1.getTime() < d2.getTime()
      ) {
        return { desde: d1, hasta: d2 };
      }
    }
    return null;
  }, [desdeStr, hastaStr, respuesta]);

  const rangoGraficaLabel = useMemo(() => {
    if (rangoExport == null) return null;
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    return `${fmt(rangoExport.desde)} - ${fmt(rangoExport.hasta)}`;
  }, [rangoExport]);

  const exportacionDeshabilitada =
    cargando || datosCompletos.length === 0 || rangoExport == null;

  const ejecutarExportacion = (fn: () => void) => {
    try {
      setExportError(null);
      fn();
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : 'No se pudo generar el archivo.'
      );
    }
  };

  return (
    <>
      <Card
        id={sectionId}
        className={embedded ? 'shadow-sm h-full scroll-mt-20' : 'mt-8 scroll-mt-20'}
      >
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">
            {embedded ? 'Monitoreo y análisis' : 'Historial oficial'}
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            {embedded
              ? `Últimas ${HORAS_DEFECTO} h · ${nombreContenedor}`
              : (
                <>
                  Telemetría certificada · <span className="font-mono">{codigo}</span>
                </>
              )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void ejecutarBusqueda()}
            disabled={cargando}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', cargando && 'animate-spin')}
            />
            Actualizar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReporteInternoOpen(true)}
          >
            <FileBarChart2 className="h-4 w-4 mr-2" />
            Reporte interno
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReporteCaOpen(true)}
          >
            <FlaskConical className="h-4 w-4 mr-2" />
            Reporte CA
          </Button>
          <div className="flex flex-col gap-1 items-stretch sm:items-end">
            <div className="flex flex-wrap gap-2 justify-end">
              <span className="text-xs text-muted-foreground self-center hidden sm:inline">
                Exportar
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={exportacionDeshabilitada}
                title="Descargar CSV"
                onClick={() => {
                  if (rangoExport == null) return;
                  ejecutarExportacion(() =>
                    exportHistorialCsv(datosCompletos, imei, rangoExport)
                  );
                }}
              >
                <FileType2 className="h-4 w-4 mr-1.5 shrink-0" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportacionDeshabilitada}
                title="Descargar Excel"
                onClick={() => {
                  if (rangoExport == null) return;
                  ejecutarExportacion(() =>
                    exportHistorialXlsx(datosCompletos, imei, rangoExport)
                  );
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5 shrink-0" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportacionDeshabilitada}
                title="Descargar PDF"
                onClick={() => {
                  if (rangoExport == null) return;
                  ejecutarExportacion(() =>
                    exportHistorialPdf(datosCompletos, imei, rangoExport)
                  );
                }}
              >
                <FileText className="h-4 w-4 mr-1.5 shrink-0" />
                PDF
              </Button>
              {esSuperUser && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportacionDeshabilitada}
                  title="Descargar JSON (superusuario)"
                  onClick={() => {
                    if (rangoExport == null) return;
                    ejecutarExportacion(() =>
                      exportHistorialJson(datosCompletos, imei, codigo, rangoExport)
                    );
                  }}
                >
                  <Braces className="h-4 w-4 mr-1.5 shrink-0" />
                  JSON
                </Button>
              )}
            </div>
            {exportError != null && (
              <p className="text-xs text-destructive text-right max-w-md">{exportError}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', embedded && 'p-3')}>
          <p className="text-sm font-medium">Búsqueda por fecha</p>
          {!embedded && (
            <p className="text-xs text-muted-foreground">
              La petición añade{' '}
              <code className="rounded bg-muted px-1">fecha_inicial</code> y{' '}
              <code className="rounded bg-muted px-1">fecha_final</code> con formato{' '}
              <span className="font-mono">YYYY-MM-DD_HH-MM-SS</span>.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="hist-desde">Fecha inicial</Label>
              <Input
                id="hist-desde"
                type="datetime-local"
                step="1"
                value={desdeStr}
                onChange={(e) => setDesdeStr(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-hasta">Fecha final</Label>
              <Input
                id="hist-hasta"
                type="datetime-local"
                step="1"
                value={hastaStr}
                onChange={(e) => setHastaStr(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void ejecutarBusqueda()}
                disabled={cargando}
              >
                <Search className="h-4 w-4 mr-2" />
                Buscar
              </Button>
            </div>
          </div>
        </div>

        {cargando && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
            <RefreshCw className="h-8 w-8 animate-spin" />
            Cargando datos oficiales…
          </div>
        )}

        {!cargando && error != null && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
            <Button
              variant="link"
              className="px-2 h-auto text-destructive"
              onClick={() => void ejecutarBusqueda()}
            >
              Reintentar
            </Button>
          </div>
        )}

        {!cargando && !error && respuesta != null && (
          <>
            {respuesta.data.total_datos != null && (
              <p className="text-xs text-muted-foreground">
                Ventana solicitada:{' '}
                {new Date(respuesta.data.fecha_inicial).toLocaleString('es-ES')}{' '}
                —{' '}
                {new Date(respuesta.data.fecha_final).toLocaleString('es-ES')} ·
                Registros: {respuesta.data.total_datos}
              </p>
            )}

            {sinRegistrosApi ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay datos oficiales para el rango seleccionado.
              </p>
            ) : (
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as 'datos' | 'grafica')}
                className="w-full"
              >
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="grafica" className="flex-1 sm:flex-initial">
                    Gráfica histórica
                  </TabsTrigger>
                  <TabsTrigger value="datos" className="flex-1 sm:flex-initial">
                    Datos en tabla
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="datos" className="mt-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    La primera columna es la <strong>fecha</strong> del registro (
                    <code className="text-[10px]">created_at</code> o{' '}
                    <code className="text-[10px]">fecha</code> si no hay created_at). Orden:
                    más reciente arriba.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {totalFilas === 0
                        ? 'Sin registros'
                        : `Mostrando ${inicioSlice + 1}–${Math.min(
                            inicioSlice + pageSize,
                            totalFilas
                          )} de ${totalFilas}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Por página</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                          setPageSize(Number(v));
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[100px]" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paginaSegura <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm tabular-nums">
                        {paginaSegura} / {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paginaSegura >= totalPaginas}
                        onClick={() =>
                          setPage((p) => Math.min(totalPaginas, p + 1))
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {TABLA_HISTORIAL_COLUMNAS.map((c) => (
                            <TableHead
                              key={c.key}
                              className="whitespace-nowrap text-xs"
                            >
                              {c.header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filasPagina.map((row, i) => (
                          <TableRow key={claveFilaHistorial(row, inicioSlice + i)}>
                            {TABLA_HISTORIAL_COLUMNAS.map((c) => (
                              <TableCell
                                key={c.key}
                                className="text-xs tabular-nums"
                              >
                                {celdaHistorial(row, c.key)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="grafica" className="mt-4">
                  <HistorialReeferChart
                    data={chartData}
                    imei={imei}
                    nombreContenedor={nombreContenedor}
                    rangoLabel={rangoGraficaLabel}
                  />
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </CardContent>
    </Card>
      <ReporteInternoModal
        open={reporteInternoOpen}
        onOpenChange={setReporteInternoOpen}
        imei={imei}
        codigo={codigo}
        nombreContenedor={nombreContenedor}
      />
      <ReporteCaModal
        open={reporteCaOpen}
        onOpenChange={setReporteCaOpen}
        imei={imei}
        codigo={codigo}
        nombreContenedor={nombreContenedor}
      />
    </>
  );
}
