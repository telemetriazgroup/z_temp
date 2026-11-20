import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Loader2, Search } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { displayNameForDevice } from '../modules/usuario';
import { readDeviceLocalNames, refreshDeviceNamesFromServer } from '../lib/deviceLocalNames';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  descargarArchivoInforme,
  fetchEquiposInforme,
  fetchInformeJob,
  generarInforme,
  type EquipoInforme,
  type InformeJob,
} from '../modules/informe/informeApi';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function rowKeyOf(equipo: EquipoInforme): string {
  return equipo.codigo ? `${equipo.codigo}-${equipo.imei}` : equipo.imei;
}

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export default function GeneradorInformes() {
  const { user } = useAuth();
  const [equipos, setEquipos] = useState<EquipoInforme[]>([]);
  const [nombresListos, setNombresListos] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [equipoKey, setEquipoKey] = useState('');
  const [nombreLibre, setNombreLibre] = useState('');
  const [desde, setDesde] = useState(daysAgo(7));
  const [hasta, setHasta] = useState(todayIso());
  const [idioma, setIdioma] = useState('es');
  const [reconstruir, setReconstruir] = useState(true);
  const [tolerancia, setTolerancia] = useState('9');
  const [job, setJob] = useState<InformeJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchEquiposInforme()
      .then(setEquipos)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la flota'));
    void refreshDeviceNamesFromServer()
      .catch(() => {})
      .finally(() => setNombresListos((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return;
    const t = window.setInterval(() => {
      void fetchInformeJob(job.id)
        .then(setJob)
        .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo consultar el informe'));
    }, 2000);
    return () => window.clearInterval(t);
  }, [job?.id, job?.status]);

  const localNames = useMemo(() => readDeviceLocalNames(), [nombresListos, user]);

  const nombreAsignado = (equipo: EquipoInforme): string | null => {
    const shown = displayNameForDevice(user, equipo.imei, rowKeyOf(equipo), localNames, SIN_ASIGNAR);
    if (shown !== SIN_ASIGNAR) return shown;
    return equipo.nombre;
  };

  const equipo = equipos.find((e) => `${e.codigo}|${e.imei}` === equipoKey) ?? null;
  const nombreLigado = equipo ? nombreAsignado(equipo) : null;
  const nombreInforme = nombreLigado || nombreLibre.trim();

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 1) return [];
    return equipos
      .filter((e) => {
        const nombre = (nombreAsignado(e) ?? SIN_ASIGNAR).toLowerCase();
        return (
          e.imei.toLowerCase().includes(q) ||
          (e.codigo ?? '').toLowerCase().includes(q) ||
          nombre.includes(q)
        );
      })
      .slice(0, 20);
  }, [busqueda, equipos, localNames, user]);

  const generar = async () => {
    if (!equipo) {
      setError('Busque y elija un equipo');
      return;
    }
    if (!nombreInforme) {
      setError('Este equipo no tiene nombre en telemetría. Indique el nombre del informe.');
      return;
    }
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const id = await generarInforme({
        imei: equipo.imei,
        codigo: equipo.codigo,
        nombre: nombreInforme,
        desde,
        hasta,
        idioma,
        tolerancia: Number(tolerancia),
        reconstruir,
      });
      setJob(await fetchInformeJob(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar');
    } finally {
      setBusy(false);
    }
  };

  const archivos = [
    ...(job?.result?.pdfs ?? []),
    job?.result?.datos,
    job?.result?.resumen,
    job?.result?.huecos_csv,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Generador de informes</h1>
        <p className="text-sm text-muted-foreground">
          Informe de cadena de frío por día, armado con el historial oficial del equipo.
          No hace falta subir un CSV: suministro, retorno, evaporador, set point y estado
          de energía salen de la telemetría.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipo y período</CardTitle>
          <CardDescription>
            La banda de cumplimiento es set point ± tolerancia, medida en el aire de retorno.
            El defrost (evaporador) y el arranque quedan fuera de ese porcentaje. Cada día
            cierra en 24 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2">
            <Label>Equipo</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, IMEI o código"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            {equipo && (
              <p className="text-sm">
                <span className="font-medium">{nombreLigado ?? SIN_ASIGNAR}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {equipo.codigo} · {equipo.imei}
                </span>
                <button
                  type="button"
                  className="ml-2 text-xs underline text-muted-foreground"
                  onClick={() => {
                    setEquipoKey('');
                    setNombreLibre('');
                  }}
                >
                  Quitar
                </button>
              </p>
            )}
            {busqueda.trim().length > 0 && (
              <ul className="max-h-52 overflow-y-auto rounded-md border divide-y">
                {coincidencias.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">Ningún equipo coincide.</li>
                )}
                {coincidencias.map((e) => {
                  const asignado = nombreAsignado(e);
                  const key = `${e.codigo}|${e.imei}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setEquipoKey(key);
                          setNombreLibre('');
                          setBusqueda('');
                        }}
                      >
                        <span className="block truncate">{asignado ?? SIN_ASIGNAR}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.codigo} · {e.imei}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Nombre en el informe</Label>
            <Input
              value={equipo ? (nombreLigado ?? nombreLibre) : ''}
              disabled={!equipo || nombreLigado != null}
              onChange={(e) => setNombreLibre(e.target.value)}
              placeholder={
                !equipo
                  ? 'Elija un equipo'
                  : nombreLigado
                    ? undefined
                    : 'Sin nombre en telemetría'
              }
            />
            {equipo && (
              <p className="text-[11px] text-muted-foreground">
                {nombreLigado
                  ? 'Tomado del nombre asignado en telemetría.'
                  : 'Este equipo está sin asignar. Escriba el nombre que debe llevar el informe.'}
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Idioma</Label>
            <Select value={idioma} onValueChange={setIdioma}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">Inglés</SelectItem>
                <SelectItem value="ambos">Español e inglés</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Tolerancia (°C)</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={tolerancia}
              onChange={(e) => setTolerancia(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={reconstruir}
              onChange={(e) => setReconstruir(e.target.checked)}
            />
            Rellenar huecos de más de 2 horas como tendencia (queda marcado, no es medición)
          </label>
          <div className="sm:col-span-2">
            <Button onClick={() => void generar()} disabled={busy || job?.status === 'running'}>
              {(busy || job?.status === 'running' || job?.status === 'queued') && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Generar informe
            </Button>
          </div>
          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {job.status === 'done'
                ? 'Informe listo'
                : job.status === 'error'
                  ? 'No se pudo generar'
                  : 'Generando…'}
            </CardTitle>
            {job.result && (
              <CardDescription>
                {job.result.dias} días · {job.result.registros} muestras · set{' '}
                {job.result.set_point?.toFixed(1)} °C · cumplimiento{' '}
                {job.result.cumplimiento?.toFixed(1)} % ·{' '}
                {job.result.horas_en_rango_prom?.toFixed(1)} h en rango/día
                {job.result.filas_reconstruidas
                  ? ` · ${job.result.filas_reconstruidas} muestras de tendencia`
                  : ''}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {job.error && <p className="text-sm text-destructive">{job.error}</p>}
            <ul className="space-y-2">
              {archivos.map((nombreArchivo) => (
                <li key={nombreArchivo}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-sm underline"
                    onClick={() =>
                      void descargarArchivoInforme(job.id, nombreArchivo).catch((e) =>
                        setError(e instanceof Error ? e.message : 'No se pudo descargar')
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    {nombreArchivo}
                  </button>
                </li>
              ))}
            </ul>
            {job.log.length > 0 && (
              <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
                {job.log.join('\n')}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
