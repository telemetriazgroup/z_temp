import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';

const ADMIN = '/reefer/api/correo/api-externa';

interface EquipoFlota {
  imei: string;
  origen: string;
  marca: string | null;
  nombre: string | null;
  conexion: string | null;
}

interface DemoApi {
  id: string;
  nombre: string;
  motivo: 'cliente' | 'desarrollo';
  prefix: string | null;
  equipos: { origen: string; imei: string }[];
  duracionValor: number;
  duracionUnidad: 'horas' | 'dias';
  venceEn: string;
  estado: 'vigente' | 'vencida' | 'revocada';
  lastUsedAt: string | null;
}

function headers(username: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-ZTrack-User': username };
}

function claveEquipo(equipo: { origen: string; imei: string }): string {
  return `${equipo.origen}|${equipo.imei}`;
}

function momento(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function DemoConexion({
  username,
  onClave,
}: {
  username: string;
  onClave: (clave: string, nombre: string) => void;
}) {
  const [flota, setFlota] = useState<EquipoFlota[]>([]);
  const [demos, setDemos] = useState<DemoApi[]>([]);
  const [nombre, setNombre] = useState('');
  const [motivo, setMotivo] = useState<'cliente' | 'desarrollo'>('cliente');
  const [duracion, setDuracion] = useState('24');
  const [unidad, setUnidad] = useState<'horas' | 'dias'>('horas');
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState<EquipoFlota[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const [flotaRes, demosRes] = await Promise.all([
      fetch(`${ADMIN}/flota`, { headers: headers(username) }),
      fetch(`${ADMIN}/demos`, { headers: headers(username) }),
    ]);
    const flotaBody = await flotaRes.json();
    const demosBody = await demosRes.json();
    if (!flotaRes.ok || flotaBody.ok === false) throw new Error(flotaBody.error || 'No se pudo leer la flota');
    if (!demosRes.ok || demosBody.ok === false) throw new Error(demosBody.error || 'No se pudieron leer las demos');
    setFlota(flotaBody.data);
    setDemos(demosBody.data);
  }

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'));
  }, [username]);

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    return flota
      .filter((e) => `${e.nombre ?? ''} ${e.imei} ${e.origen} ${e.marca ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [flota, busqueda]);

  function marcar(equipo: EquipoFlota, activo: boolean) {
    const clave = claveEquipo(equipo);
    setElegidos((prev) =>
      activo ? (prev.some((e) => claveEquipo(e) === clave) ? prev : [...prev, equipo]) : prev.filter((e) => claveEquipo(e) !== clave)
    );
  }

  async function crear() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN}/demos`, {
        method: 'POST',
        headers: headers(username),
        body: JSON.stringify({
          nombre,
          motivo,
          duracionValor: Number(duracion),
          duracionUnidad: unidad,
          equipos: elegidos.map((e) => ({ origen: e.origen, imei: e.imei })),
        }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || 'No se pudo crear la demo');
      onClave(body.clave, body.data.nombre);
      setNombre('');
      setElegidos([]);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la demo');
    } finally {
      setOcupado(false);
    }
  }

  async function revocar(id: string) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN}/demos/${encodeURIComponent(id)}/revocar`, {
        method: 'POST',
        headers: headers(username),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || 'No se pudo revocar');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva conexión demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La clave no pertenece a una cuenta de la plataforma. Caduca al cumplirse el tiempo y solo
            entrega los equipos marcados. Sirve para que un cliente pruebe la integración o para una
            prueba de desarrollo.
          </p>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la conexión" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={motivo === 'cliente' ? 'default' : 'outline'} onClick={() => setMotivo('cliente')}>
              Prueba de cliente
            </Button>
            <Button type="button" variant={motivo === 'desarrollo' ? 'default' : 'outline'} onClick={() => setMotivo('desarrollo')}>
              Desarrollo
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={unidad === 'horas' ? 168 : 30}
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="w-28"
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value === 'dias' ? 'dias' : 'horas')}
            >
              <option value="horas">Horas</option>
              <option value="dias">Días</option>
            </select>
            <span className="self-center text-xs text-muted-foreground">Horas: 1 a 168. Días: 1 a 30.</span>
          </div>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo por nombre o IMEI"
          />
          {elegidos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {elegidos.map((e) => (
                <button
                  key={claveEquipo(e)}
                  type="button"
                  className="rounded-full border px-2 py-1 text-xs"
                  onClick={() => marcar(e, false)}
                >
                  {(e.nombre || e.imei) + ' · ' + e.origen} ×
                </button>
              ))}
            </div>
          )}
          <div className="max-h-64 overflow-auto rounded-md border">
            {busqueda.trim().length < 2 && (
              <p className="p-3 text-sm text-muted-foreground">Escriba al menos dos caracteres para ver equipos.</p>
            )}
            {busqueda.trim().length >= 2 && coincidencias.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No hay equipos con ese texto.</p>
            )}
            {coincidencias.map((equipo) => {
              const marcado = elegidos.some((e) => claveEquipo(e) === claveEquipo(equipo));
              return (
                <label key={claveEquipo(equipo)} className="flex items-start gap-2 border-b px-3 py-2 text-sm">
                  <Checkbox checked={marcado} onCheckedChange={(v) => marcar(equipo, v === true)} />
                  <span>
                    <span className="font-medium">{equipo.nombre || 'Sin nombre'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {equipo.origen} · {equipo.marca} · {equipo.imei}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="button" disabled={ocupado || elegidos.length === 0 || nombre.trim().length < 2} onClick={crear}>
            Crear conexión demo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conexiones demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {demos.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay demos.</p>}
          {demos.map((demo) => (
            <div key={demo.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{demo.nombre}</span>
                <Badge variant={demo.estado === 'vigente' ? 'default' : 'outline'}>
                  {demo.estado === 'vigente' ? 'Vigente' : demo.estado === 'vencida' ? 'Vencida' : 'Revocada'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {demo.motivo === 'cliente' ? 'Prueba de cliente' : 'Desarrollo'} · {demo.duracionValor}{' '}
                {demo.duracionUnidad} · {demo.equipos.length} equipos · {demo.prefix ?? 'sin clave'}
              </p>
              <p className="text-xs">Vence: {momento(demo.venceEn)}</p>
              {demo.estado === 'vigente' && (
                <Button type="button" variant="outline" disabled={ocupado} onClick={() => revocar(demo.id)}>
                  Revocar
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
