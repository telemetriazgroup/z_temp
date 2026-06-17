import React, { useCallback, useState } from 'react';
import { fetchBuscarDatosOficiales } from '../api/datosOficiales';
import type { DispositivoOrigenCodigo } from '../types';
import { analizarSeccion31GasesEstabilizacion } from '../lib/reporteCaGases';
import type { ReporteCaSeccion31 } from '../lib/reporteCaGases';
import { ReporteCaSeccion31Panel } from './ReporteCaSeccion31Panel';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Eye, Loader2 } from 'lucide-react';
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
  nombreContenedor: string;
}

export function ReporteCaModal({
  open,
  onOpenChange,
  imei,
  codigo,
  nombreContenedor,
}: Props) {
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [producto, setProducto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seccion31, setSeccion31] = useState<ReporteCaSeccion31 | null>(null);

  const resetAlCerrar = useCallback(() => {
    setError(null);
    setSeccion31(null);
  }, []);

  const generarVista = async () => {
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
      setSeccion31(analizarSeccion31GasesEstabilizacion(res.data.datos));
    } catch (e) {
      setSeccion31(null);
      setError(e instanceof Error ? e.message : 'Error al cargar el historial');
    } finally {
      setCargando(false);
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
          <DialogTitle>Reporte CA</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Contenedor {nombreContenedor} · IMEI {imei} · {codigo}
          </p>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ca-ini">Fecha inicio (proceso)</Label>
            <Input
              id="ca-ini"
              type="date"
              value={fechaIni}
              onChange={(e) => setFechaIni(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-fin">Fecha final</Label>
            <Input
              id="ca-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ca-prod">Producto (obligatorio)</Label>
            <Input
              id="ca-prod"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              placeholder="Ej. PLÁTANO"
            />
          </div>
        </div>

        {error != null && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          variant="secondary"
          onClick={() => void generarVista()}
          disabled={cargando}
        >
          {cargando ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          Generar sección 3.1
        </Button>

        {seccion31 != null && <ReporteCaSeccion31Panel seccion={seccion31} />}

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
