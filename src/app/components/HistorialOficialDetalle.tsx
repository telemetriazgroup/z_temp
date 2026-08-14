import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBuscarDatosOficiales } from '../api/datosOficiales';
import type {
  BuscarDatosOficialesResponse,
  DatoOficialHistorial,
  DispositivoOrigenCodigo,
} from '../types';
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
  filtrarDatosPorRangoMs,
  datosCubrenRangoMs,
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
import {
  dateToDatetimeLocalInTz,
  formatDateInTz,
  formatDateTimeInTz,
  parseDatetimeLocalInTz,
  rangoUltimasHorasInTz,
  resolveDisplayTimeZone,
} from '../lib/telemetryTimezone';
import { useAuth } from '../AuthContext';
import { postAuditEvent } from '../modules/usuario';
import { AUDIT_ACTIONS } from '../modules/usuario/auditActions';
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
  token: number;
  desdeIso: string;
  hastaIso: string;
};

interface Props {
  imei: string;
  codigo: DispositivoOrigenCodigo;
  nombreContenedor: string;
  embedded?: boolean;
  /** @deprecated Se muestran gráfica y tabla juntas. */
  defaultTab?: 'datos' | 'grafica';
  focusRango?: HistorialFocusRango | null;
  sectionId?: string;
  /** zona_horaria del listado (ej. GMT-4 / GMT-5). */
  zonaHoraria?: string | null;
}

export function HistorialOficialDetalle({
  imei,
  codigo,
  nombreContenedor,
  embedded = false,
  focusRango = null,
  sectionId = 'historial-oficial',
  zonaHoraria = null,
}: Props) {
  const { user } = useAuth();
  const esSuperUser = user?.superUser === true;
  const displayTz = useMemo(
    () => resolveDisplayTimeZone(zonaHoraria),
    [zonaHoraria]
  );

  const [reporteInternoOpen, setReporteInternoOpen] = useState(false);
  const [reporteCaOpen, setReporteCaOpen] = useState(false);
  const initRango = rangoUltimasHorasInTz(HORAS_DEFECTO, displayTz);
  const [desdeStr, setDesdeStr] = useState(initRango.desde);
  const [hastaStr, setHastaStr] = useState(initRango.hasta);

  /** Última respuesta completa de la API (caché local). */
  const [respuesta, setRespuesta] = useState<BuscarDatosOficialesResponse | null>(
    null
  );
  /** Si hay foco/filtro sobre un subrango ya cargado, no se vuelve a pedir. */
  const [filtroVistaMs, setFiltroVistaMs] = useState<{
    desde: number;
    hasta: number;
  } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [exportError, setExportError] = useState<string | null>(null);
  const respuestaRef = useRef(respuesta);
  respuestaRef.current = respuesta;

  const cargarRango = useCallback(
    async (fi: Date, ff: Date, opts?: { usarCacheSiCubre?: boolean }) => {
      const desdeMs = fi.getTime();
      const hastaMs = ff.getTime();
      const cache = respuestaRef.current?.data?.datos ?? [];

      if (
        opts?.usarCacheSiCubre &&
        datosCubrenRangoMs(cache, desdeMs, hastaMs)
      ) {
        setFiltroVistaMs({ desde: desdeMs, hasta: hastaMs });
        setDesdeStr(dateToDatetimeLocalInTz(fi, displayTz.iana));
        setHastaStr(dateToDatetimeLocalInTz(ff, displayTz.iana));
        setError(null);
        setPage(1);
        return true;
      }

      setError(null);
      setCargando(true);
      try {
        const r = await fetchBuscarDatosOficiales(codigo, imei, {
          fechaInicial: fi,
          fechaFinal: ff,
        });
        setRespuesta(r);
        setFiltroVistaMs(null);
        setDesdeStr(dateToDatetimeLocalInTz(fi, displayTz.iana));
        setHastaStr(dateToDatetimeLocalInTz(ff, displayTz.iana));
        setPage(1);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar historial');
        setRespuesta(null);
        setFiltroVistaMs(null);
        return false;
      } finally {
        setCargando(false);
      }
    },
    [codigo, imei, displayTz.iana]
  );

  const ejecutarBusqueda = useCallback(async () => {
    const fi = parseDatetimeLocalInTz(desdeStr, displayTz);
    const ff = parseDatetimeLocalInTz(hastaStr, displayTz);
    if (fi == null || ff == null) {
      setError('Indique fechas válidas.');
      return false;
    }
    if (fi.getTime() >= ff.getTime()) {
      setError('La fecha inicial debe ser anterior a la fecha final.');
      return false;
    }
    // Buscar explícito: nueva consulta (puede ampliar ventana).
    return cargarRango(fi, ff, { usarCacheSiCubre: false });
  }, [desdeStr, hastaStr, displayTz, cargarRango]);

  const cargarUltimasHoras = useCallback(async () => {
    const rango = rangoUltimasHorasInTz(HORAS_DEFECTO, displayTz);
    const fi = parseDatetimeLocalInTz(rango.desde, displayTz);
    const ff = parseDatetimeLocalInTz(rango.hasta, displayTz);
    if (fi == null || ff == null) return;
    await cargarRango(fi, ff, { usarCacheSiCubre: false });
  }, [displayTz, cargarRango]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rango = rangoUltimasHorasInTz(HORAS_DEFECTO, displayTz);
      setDesdeStr(rango.desde);
      setHastaStr(rango.hasta);
      const fi = parseDatetimeLocalInTz(rango.desde, displayTz);
      const ff = parseDatetimeLocalInTz(rango.hasta, displayTz);
      if (fi == null || ff == null) return;

      setCargando(true);
      setError(null);
      try {
        const res = await fetchBuscarDatosOficiales(codigo, imei, {
          fechaInicial: fi,
          fechaFinal: ff,
        });
        if (!cancelled) {
          setRespuesta(res);
          setFiltroVistaMs(null);
        }
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
    // Solo al cambiar equipo / zona de visualización
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, imei, displayTz.iana]);

  useEffect(() => {
    if (focusRango == null) return;
    const fi = new Date(focusRango.desdeIso);
    const ff = new Date(focusRango.hastaIso);
    if (Number.isNaN(fi.getTime()) || Number.isNaN(ff.getTime())) return;
    if (fi.getTime() >= ff.getTime()) return;

    void cargarRango(fi, ff, { usarCacheSiCubre: true });

    requestAnimationFrame(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focusRango, cargarRango, sectionId]);

  const datosBase: DatoOficialHistorial[] = respuesta?.data.datos ?? [];
  const datosCompletos = useMemo(() => {
    if (filtroVistaMs == null) return datosBase;
    return filtrarDatosPorRangoMs(
      datosBase,
      filtroVistaMs.desde,
      filtroVistaMs.hasta
    );
  }, [datosBase, filtroVistaMs]);

  const filasTabla = useMemo(
    () => ordenarTablaDesc(datosCompletos),
    [datosCompletos]
  );
  const totalFilas = filasTabla.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / pageSize) || 1);
  const paginaSegura = Math.min(page, totalPaginas);
  const inicioSlice = (paginaSegura - 1) * pageSize;
  const filasPagina = filasTabla.slice(inicioSlice, inicioSlice + pageSize);

  useEffect(() => {
    setPage(1);
  }, [datosCompletos.length, pageSize]);

  const chartData = useMemo(
    () => datosAGrafica(datosCompletos, zonaHoraria),
    [datosCompletos, zonaHoraria]
  );

  const sinRegistrosApi =
    !cargando && respuesta != null && datosCompletos.length === 0;

  const rangoExport = useMemo((): HistorialExportRango | null => {
    const a = parseDatetimeLocalInTz(desdeStr, displayTz);
    const b = parseDatetimeLocalInTz(hastaStr, displayTz);
    if (a != null && b != null && a.getTime() < b.getTime()) {
      return { desde: a, hasta: b };
    }
    return null;
  }, [desdeStr, hastaStr, displayTz]);

  const rangoGraficaLabel = useMemo(() => {
    if (rangoExport == null) return null;
    return `${formatDateInTz(rangoExport.desde, displayTz.iana)} - ${formatDateInTz(rangoExport.hasta, displayTz.iana)} (${displayTz.label})`;
  }, [rangoExport, displayTz]);

  const exportacionDeshabilitada =
    cargando || datosCompletos.length === 0 || rangoExport == null;

  const ejecutarExportacion = (
    fn: () => void,
    meta?: { action: string; label: string }
  ) => {
    try {
      setExportError(null);
      fn();
      if (meta && user?.username) {
        void postAuditEvent(user.username, {
          action: meta.action,
          module: 'listado',
          summary: `${meta.label} del equipo ${imei}`,
          targetId: imei,
          detail: {
            imei,
            codigo,
            desde: rangoExport?.desde,
            hasta: rangoExport?.hasta,
          },
        });
      }
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
                ? `Últimas ${HORAS_DEFECTO} h · ${nombreContenedor} · ${displayTz.label}`
                : (
                  <>
                    Telemetría certificada ·{' '}
                    <span className="font-mono">{codigo}</span> · {displayTz.label}
                  </>
                )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cargando}
              onClick={() => void cargarUltimasHoras()}
              title={`Recargar últimas ${HORAS_DEFECTO} h`}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', cargando && 'animate-spin')} />
              Últimas {HORAS_DEFECTO} h
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setReporteInternoOpen(true)}
            >
              <FileBarChart2 className="h-4 w-4 mr-1" />
              Reporte interno
            </Button>
            {esSuperUser && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReporteCaOpen(true)}
              >
                <FlaskConical className="h-4 w-4 mr-1" />
                Reporte CA
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exportacionDeshabilitada}
              onClick={() => {
                if (rangoExport == null) return;
                ejecutarExportacion(
                  () =>
                    exportHistorialCsv(
                      datosCompletos,
                      imei,
                      codigo,
                      rangoExport,
                      zonaHoraria
                    ),
                  {
                    action: AUDIT_ACTIONS.DOWNLOAD_HISTORIAL_CSV,
                    label: 'Descargó historial CSV',
                  }
                );
              }}
            >
              <FileText className="h-4 w-4 mr-1.5 shrink-0" />
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exportacionDeshabilitada}
              onClick={() => {
                if (rangoExport == null) return;
                ejecutarExportacion(
                  () =>
                    exportHistorialXlsx(
                      datosCompletos,
                      imei,
                      codigo,
                      rangoExport,
                      zonaHoraria
                    ),
                  {
                    action: AUDIT_ACTIONS.DOWNLOAD_HISTORIAL_XLSX,
                    label: 'Descargó historial Excel',
                  }
                );
              }}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 shrink-0" />
              Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exportacionDeshabilitada}
              onClick={() => {
                if (rangoExport == null) return;
                ejecutarExportacion(
                  () =>
                    exportHistorialPdf(
                      datosCompletos,
                      imei,
                      codigo,
                      nombreContenedor,
                      rangoExport,
                      zonaHoraria
                    ),
                  {
                    action: AUDIT_ACTIONS.DOWNLOAD_HISTORIAL_PDF,
                    label: 'Descargó historial PDF',
                  }
                );
              }}
            >
              <FileType2 className="h-4 w-4 mr-1.5 shrink-0" />
              PDF
            </Button>
            {esSuperUser && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={exportacionDeshabilitada}
                onClick={() => {
                  if (rangoExport == null) return;
                  ejecutarExportacion(
                    () =>
                      exportHistorialJson(
                        datosCompletos,
                        imei,
                        codigo,
                        rangoExport,
                        zonaHoraria
                      ),
                    {
                      action: AUDIT_ACTIONS.DOWNLOAD_HISTORIAL_JSON,
                      label: 'Descargó historial JSON',
                    }
                  );
                }}
              >
                <Braces className="h-4 w-4 mr-1.5 shrink-0" />
                JSON
              </Button>
            )}
          </div>
          {exportError != null && (
            <p className="text-xs text-destructive text-right max-w-md w-full">
              {exportError}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', embedded && 'p-3')}
          >
            <p className="text-sm font-medium">
              Búsqueda por fecha ({displayTz.label})
            </p>
            <p className="text-xs text-muted-foreground">
              Horas de pared en {displayTz.label}. La consulta a la API usa GMT-5
              (fuente de telemetría).
            </p>
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
              <div className="flex items-end gap-2">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void ejecutarBusqueda()}
                  disabled={cargando}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </Button>
                {filtroVistaMs != null && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={cargando}
                    onClick={() => {
                      setFiltroVistaMs(null);
                      setPage(1);
                    }}
                  >
                    Ver todo lo cargado
                  </Button>
                )}
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
                  Ventana:{' '}
                  {formatDateTimeInTz(
                    parseDatetimeLocalInTz(desdeStr, displayTz),
                    displayTz.iana
                  )}{' '}
                  —{' '}
                  {formatDateTimeInTz(
                    parseDatetimeLocalInTz(hastaStr, displayTz),
                    displayTz.iana
                  )}{' '}
                  ({displayTz.label})
                  {filtroVistaMs != null
                    ? ` · Filtro sobre ${datosBase.length} registros en memoria`
                    : ` · Registros: ${respuesta.data.total_datos}`}
                </p>
              )}

              {sinRegistrosApi ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No hay datos oficiales para el rango seleccionado.
                </p>
              ) : (
                <div className="space-y-8">
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Gráfica histórica</h3>
                    <HistorialReeferChart
                      data={chartData}
                      imei={imei}
                      nombreContenedor={nombreContenedor}
                      rangoLabel={rangoGraficaLabel}
                      zonaHoraria={zonaHoraria}
                    />
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-medium">Datos en tabla</h3>
                    <p className="text-xs text-muted-foreground">
                      Misma consulta que la gráfica (sin volver a pedir al API).
                      Fechas en {displayTz.label}. Orden: más reciente arriba.
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
                        <span className="text-xs text-muted-foreground">
                          Por página
                        </span>
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
                            <TableRow
                              key={claveFilaHistorial(row, inicioSlice + i)}
                            >
                              {TABLA_HISTORIAL_COLUMNAS.map((c) => (
                                <TableCell
                                  key={c.key}
                                  className="text-xs tabular-nums"
                                >
                                  {celdaHistorial(row, c.key, zonaHoraria)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </div>
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
