import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dispositivoTieneHistorialOficial,
  fetchBuscarDatosOficiales,
} from '../api/datosOficiales';
import type { DatoOficialHistorial, DispositivoOrigenCodigo } from '../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { HistorialReeferChart } from './HistorialReeferChart';
import {
  celdaHistorial,
  claveFilaHistorial,
  datosAGrafica,
  filtrarDatosUltimasHoras,
  muestrearHistorialCada30Min,
  TABLA_HISTORIAL_COLUMNAS,
  tendenciaEnTablaDesc,
} from '../lib/historialOficial';
import { resolveDisplayTimeZone } from '../lib/telemetryTimezone';
import { normalizeTemperaturaUnidad } from '../lib/temperatureUnit';
import { TempConTendencia } from './TempConTendencia';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { postAuditEvent } from '../modules/usuario';

const VENTANA_HORAS = 3;

export type Historial3hTarget = {
  imei: string;
  codigo: DispositivoOrigenCodigo | string;
  nombre?: string;
  zonaHoraria?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Historial3hTarget | null;
}

export function Historial3hModal({ open, onOpenChange, target }: Props) {
  const { user } = useAuth();
  const tempUnidad = normalizeTemperaturaUnidad(user?.temperaturaUnidad);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatoOficialHistorial[]>([]);
  const [cargadoAt, setCargadoAt] = useState<Date | null>(null);

  const codigoOk =
    target != null &&
    dispositivoTieneHistorialOficial(target.codigo as DispositivoOrigenCodigo);

  const displayTz = useMemo(
    () => resolveDisplayTimeZone(target?.zonaHoraria),
    [target?.zonaHoraria]
  );

  const load = useCallback(async () => {
    if (
      target == null ||
      !dispositivoTieneHistorialOficial(target.codigo as DispositivoOrigenCodigo)
    ) {
      setError('Este origen no tiene historial oficial disponible.');
      setDatos([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fechaFinal = new Date();
      const fechaInicial = new Date(
        fechaFinal.getTime() - VENTANA_HORAS * 60 * 60 * 1000
      );
      const res = await fetchBuscarDatosOficiales(
        target.codigo as DispositivoOrigenCodigo,
        target.imei,
        { fechaInicial, fechaFinal }
      );
      const filtrados = filtrarDatosUltimasHoras(
        res.data.datos,
        VENTANA_HORAS,
        fechaFinal
      );
      setDatos(filtrados);
      setCargadoAt(fechaFinal);
      if (user?.username) {
        void postAuditEvent(user.username, {
          action: 'telemetry.view',
          module: 'listado',
          summary: `Vio últimas ${VENTANA_HORAS}h de ${target.imei}`,
          targetUsername: target.imei,
          detail: {
            imei: target.imei,
            codigo: target.codigo,
            puntos: filtrados.length,
          },
        });
      }
    } catch (e) {
      setDatos([]);
      setError(e instanceof Error ? e.message : 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }, [target, user?.username]);

  useEffect(() => {
    if (!open || target == null) return;
    void load();
  }, [open, target?.imei, target?.codigo, load]);

  const chartData = useMemo(
    () => datosAGrafica(datos, target?.zonaHoraria),
    [datos, target?.zonaHoraria]
  );

  const tabla = useMemo(
    () =>
      muestrearHistorialCada30Min(
        datos,
        VENTANA_HORAS,
        cargadoAt ?? new Date()
      ),
    [datos, cargadoAt]
  );

  const tituloNombre =
    target?.nombre?.trim() && target.nombre !== 'SIN ASIGNAR'
      ? target.nombre
      : (target?.imei ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-5xl sm:max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 space-y-3 border-b px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle>
              Últimas {VENTANA_HORAS} h · {tituloNombre}
            </DialogTitle>
            <DialogDescription>
              {target?.codigo ?? '—'} · IMEI {target?.imei ?? '—'} · zona{' '}
              {displayTz.label}. Serie completa en gráfica; tabla muestreada ~cada
              30 min.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !codigoOk}
              onClick={() => void load()}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`}
              />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading && datos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <p className="text-sm">Cargando últimas {VENTANA_HORAS} horas…</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  No se pudo cargar el historial
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && datos.length === 0 && codigoOk && (
            <p className="text-sm text-muted-foreground text-center py-10">
              Sin registros en las últimas {VENTANA_HORAS} horas.
            </p>
          )}

          {datos.length > 0 && (
            <div className="flex flex-col gap-6">
              <section className="shrink-0 overflow-hidden rounded-md border bg-card p-3">
                <h4 className="text-sm font-medium mb-3">
                  Gráfica ({datos.length} puntos)
                </h4>
                <HistorialReeferChart
                  compact
                  data={chartData}
                  imei={target?.imei ?? ''}
                  nombreContenedor={tituloNombre}
                  rangoLabel={`Últimas ${VENTANA_HORAS} h`}
                  zonaHoraria={target?.zonaHoraria}
                />
              </section>

              <section className="shrink-0 overflow-hidden rounded-md border bg-card">
                <div className="border-b px-3 py-2">
                  <h4 className="text-sm font-medium">
                    Tabla acumulada (~30 min) · {tabla.length} filas
                  </h4>
                </div>
                <div className="overflow-x-auto max-h-[280px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {TABLA_HISTORIAL_COLUMNAS.map((col) => (
                          <TableHead
                            key={col.key}
                            className="whitespace-nowrap text-xs sticky top-0 bg-card"
                          >
                            {col.esTemperatura
                              ? `${col.header} (${tempUnidad === 'F' ? '°F' : '°C'})`
                              : col.header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tabla.map((row, i) => (
                        <TableRow key={claveFilaHistorial(row, i)}>
                          {TABLA_HISTORIAL_COLUMNAS.map((col) => {
                            const texto = celdaHistorial(
                              row,
                              col.key,
                              target?.zonaHoraria,
                              { unidad: tempUnidad }
                            );
                            const tendencia =
                              col.conTendencia &&
                              (col.key === 'return_air' ||
                                col.key === 'temp_supply_1')
                                ? tendenciaEnTablaDesc(tabla, i, col.key)
                                : undefined;
                            return (
                            <TableCell
                              key={col.key}
                              className="text-xs tabular-nums whitespace-nowrap"
                            >
                              {tendencia ? (
                                <TempConTendencia
                                  texto={texto}
                                  tendencia={tendencia}
                                />
                              ) : (
                                texto
                              )}
                            </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
