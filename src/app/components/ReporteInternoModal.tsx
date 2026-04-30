import React, { Fragment, useCallback, useState } from 'react';
import { fetchBuscarDatosOficiales } from '../api/datosOficiales';
import type { DispositivoOrigenCodigo } from '../types';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  REPORTE_SLOTS,
  cadaDiaEntre,
  generarReporteInterno,
  type ReporteInternoFila,
} from '../lib/reporteInterno';
import { descargarPdfReporteInterno } from '../lib/reporteInternoPdf';
import { FileText, Eye, Loader2 } from 'lucide-react';
import { cn } from './ui/utils';

function parseDateInputLocal(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function inicioDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function finDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imei: string;
  codigo: DispositivoOrigenCodigo;
  /** Nombre asignado o identificador mostrado como contenedor. */
  nombreContenedor: string;
}

export function ReporteInternoModal({
  open,
  onOpenChange,
  imei,
  codigo,
  nombreContenedor,
}: Props) {
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [producto, setProducto] = useState('');
  const [ubc, setUbc] = useState('BASE');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<ReporteInternoFila[]>([]);
  const [obsPorFila, setObsPorFila] = useState<Record<number, string>>({});

  const resetAlCerrar = useCallback(() => {
    setError(null);
    setFilas([]);
    setObsPorFila({});
  }, []);

  const vistaPrevia = async () => {
    setError(null);
    const prod = producto.trim();
    if (!prod) {
      setError('El producto es obligatorio.');
      return;
    }
    const di = parseDateInputLocal(fechaIni);
    const df = parseDateInputLocal(fechaFin);
    if (!di || !df) {
      setError('Indique fecha de inicio y fecha final.');
      return;
    }
    if (inicioDia(di).getTime() > inicioDia(df).getTime()) {
      setError('La fecha de inicio no puede ser posterior a la final.');
      return;
    }

    setCargando(true);
    try {
      const res = await fetchBuscarDatosOficiales(codigo, imei, {
        fechaInicial: inicioDia(di),
        fechaFinal: finDia(df),
      });
      const dias = cadaDiaEntre(di, df);
      const gen = generarReporteInterno(
        res.data.datos,
        dias,
        nombreContenedor,
        prod,
        ubc.trim() || 'BASE'
      );
      setFilas(gen);
      const obs: Record<number, string> = {};
      for (const f of gen) obs[f.n] = f.observaciones;
      setObsPorFila(obs);
    } catch (e) {
      setFilas([]);
      setObsPorFila({});
      setError(e instanceof Error ? e.message : 'Error al cargar el historial');
    } finally {
      setCargando(false);
    }
  };

  const emitirPdf = () => {
    if (filas.length === 0) {
      setError('Genere primero la vista previa.');
      return;
    }
    const paraPdf: ReporteInternoFila[] = filas.map((f) => ({
      ...f,
      observaciones: (obsPorFila[f.n] ?? f.observaciones).trim() || 'SIN OBSERVACIONES',
    }));
    try {
      const titulo = `IMEI ${imei} · Origen ${codigo} · Contenedor ${nombreContenedor} · Producto ${producto.trim()} · UBC ${ubc.trim() || 'BASE'}`;
      descargarPdfReporteInterno(paraPdf, titulo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el PDF');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAlCerrar();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          'max-w-[calc(100vw-1rem)] sm:max-w-[min(1200px,95vw)] max-h-[92vh] overflow-y-auto gap-4'
        )}
      >
        <DialogHeader>
          <DialogTitle>Reporte interno</DialogTitle>
          <DialogDescription>
            Defina el rango, el producto y genere la vista previa. Los valores SUP/RET
            se toman del registro más cercano a cada franja (00:00, 04:00, …). Si SUP y
            RET no están en ±10 % del setpoint, se promedian las lecturas de la ventana
            horaria indicada (p. ej. 16:00–19:59 para la franja 16:00).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ri-ini">Fecha inicio</Label>
            <Input
              id="ri-ini"
              type="date"
              value={fechaIni}
              onChange={(e) => setFechaIni(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ri-fin">Fecha final</Label>
            <Input
              id="ri-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Contenedor</Label>
            <Input value={nombreContenedor} readOnly className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ri-prod">Producto (obligatorio)</Label>
            <Input
              id="ri-prod"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              placeholder="Ej. ACHOTE"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ri-ubc">UBC</Label>
            <Input
              id="ri-ubc"
              value={ubc}
              onChange={(e) => setUbc(e.target.value)}
              placeholder="BASE"
            />
          </div>
        </div>

        {error != null && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void vistaPrevia()} disabled={cargando}>
            {cargando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Vista previa
          </Button>
          <Button type="button" onClick={emitirPdf} disabled={cargando || filas.length === 0}>
            <FileText className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>

        {filas.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs">N</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">FECHA</TableHead>
                  <TableHead className="whitespace-nowrap text-xs min-w-[7rem]">
                    CONTENEDOR
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs">PRODUCTO</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">UBC</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">S.P.</TableHead>
                  {REPORTE_SLOTS.map((h) => (
                    <Fragment key={h}>
                      <TableHead className="whitespace-nowrap text-xs">
                        {String(h).padStart(2, '0')}:00 SUP
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-xs">
                        {String(h).padStart(2, '0')}:00 RET
                      </TableHead>
                    </Fragment>
                  ))}
                  <TableHead className="text-xs min-w-[12rem]">OBSERVACIONES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.n}>
                    <TableCell className="text-xs">{f.n}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {f.fechaFmt}
                    </TableCell>
                    <TableCell className="text-xs">{f.contenedor}</TableCell>
                    <TableCell className="text-xs">{f.producto}</TableCell>
                    <TableCell className="text-xs">{f.ubc}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {f.setPointFmt}
                    </TableCell>
                    {f.celdas.map((c, i) => (
                      <Fragment key={i}>
                        <TableCell className="text-xs tabular-nums">
                          {c.sup != null && !Number.isNaN(c.sup) ? c.sup.toFixed(1) : '—'}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {c.ret != null && !Number.isNaN(c.ret) ? c.ret.toFixed(1) : '—'}
                        </TableCell>
                      </Fragment>
                    ))}
                    <TableCell className="p-1 align-top">
                      <Textarea
                        className="min-h-[56px] text-xs resize-y"
                        value={obsPorFila[f.n] ?? ''}
                        onChange={(e) =>
                          setObsPorFila((prev) => ({
                            ...prev,
                            [f.n]: e.target.value,
                          }))
                        }
                        placeholder="SIN OBSERVACIONES"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
