import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { Tags } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';

const ADMIN = '/reefer/api/correo/nombres-equipos';

interface EquipoNombre {
  clave: string;
  imei: string;
  familia: string;
  nombre: string;
  updatedAt: string | null;
  updatedBy: string | null;
  comparteStarcool: boolean;
}

interface Suelto {
  imei: string;
  nombre: string;
}

interface Reescritura {
  id: string;
  imei: string;
  familia?: string;
  codigo?: string;
  nombreAnterior: string;
  nombreNuevo: string;
  changedAt: string;
  usuario?: string;
  origen?: string;
  aplicado?: boolean;
  motivo?: string;
}

interface Senales {
  enAmbas: number;
  soloStarcool: number;
  soloStarcool2: number;
  masRecienteStarcool: number;
  masRecienteStarcool2: number;
  empate: number;
  sinFecha: number;
  muestraStarcool: number;
  muestraStarcool2: number;
  tambienTunel: number;
  tambienThermoking: number;
}

function headers(username: string): HeadersInit {
  return { 'X-ZTrack-User': username };
}

function momento(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hourCycle: 'h23',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}

function etiquetaFamilia(familia: string | undefined, comparte = false): string {
  if (familia === 'STARCOOL' || comparte) return 'StarCool y StarCool2';
  if (familia === 'TUNEL') return 'Túnel';
  if (familia === 'TERMOKING') return 'ThermoKing';
  return familia || 'Sin origen';
}

export default function NombresEquipos() {
  const { user } = useAuth();
  const isSuper = userIsSuperAdmin(user);
  const [equipos, setEquipos] = useState<EquipoNombre[]>([]);
  const [sueltos, setSueltos] = useState<Suelto[]>([]);
  const [reescrituras, setReescrituras] = useState<Reescritura[]>([]);
  const [starcool, setStarcool] = useState<Senales | null>(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!isSuper || !user?.username) return;
    let vivo = true;
    fetch(ADMIN, { headers: headers(user.username) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.ok === false) throw new Error(body.error || `Error ${res.status}`);
        return body.data;
      })
      .then((data) => {
        if (!vivo) return;
        setEquipos(data.equipos || []);
        setSueltos(data.sueltos || []);
        setReescrituras(data.reescrituras || []);
        setStarcool(data.starcool || null);
      })
      .catch((e: Error) => {
        if (vivo) setError(e.message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [isSuper, user?.username]);

  const q = filtro.trim().toLowerCase();
  const visibles = useMemo(() => {
    if (!q) return equipos;
    return equipos.filter((e) =>
      `${e.imei} ${e.nombre} ${e.familia} ${e.updatedBy || ''}`.toLowerCase().includes(q)
    );
  }, [equipos, q]);
  const reescriturasVisibles = useMemo(() => {
    if (!q) return reescrituras;
    return reescrituras.filter((e) =>
      `${e.imei} ${e.nombreAnterior} ${e.nombreNuevo} ${e.motivo || ''} ${e.usuario || ''}`.toLowerCase().includes(q)
    );
  }, [reescrituras, q]);
  const sueltosVisibles = useMemo(() => {
    if (!q) return sueltos;
    return sueltos.filter((s) => `${s.imei} ${s.nombre}`.toLowerCase().includes(q));
  }, [sueltos, q]);

  if (!isSuper) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Nombres de equipos</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Este registro guarda el nombre aparte de la señal que se está mostrando. En StarCool y StarCool2
        el nombre de un IMEI es el mismo. Túnel y ThermoKing quedan separados, aunque el IMEI coincida.
      </p>

      {starcool && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qué señal se muestra ahora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>{starcool.enAmbas} IMEI están en StarCool y en StarCool2.</p>
            <p>{starcool.soloStarcool2} solo llegan por StarCool2. {starcool.soloStarcool} solo por StarCool.</p>
            <p>
              De los que están en las dos, la fecha más reciente es StarCool en {starcool.masRecienteStarcool} y
              StarCool2 en {starcool.masRecienteStarcool2}. {starcool.empate} tienen la misma fecha.
            </p>
            <p>
              En el listado se ven {starcool.muestraStarcool} por StarCool y {starcool.muestraStarcool2} por StarCool2.
              Si la fecha empata, queda StarCool2.
            </p>
            <p>{starcool.tambienTunel} de esos IMEI también existen en Túnel y conservan otro nombre.</p>
            <p>{starcool.tambienThermoking} también existen en ThermoKing y conservan otro nombre.</p>
          </CardContent>
        </Card>
      )}

      <Input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar por IMEI, nombre o usuario"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nombres asignados ({visibles.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3">IMEI</th>
                <th className="py-2 pr-3">Origen</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Asignó</th>
                <th className="py-2">Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.clave} className="border-b">
                  <td className="py-2 pr-3 font-mono text-xs">{e.imei}</td>
                  <td className="py-2 pr-3">{etiquetaFamilia(e.familia, e.comparteStarcool)}</td>
                  <td className="py-2 pr-3">{e.nombre}</td>
                  <td className="py-2 pr-3">{e.updatedBy || '—'}</td>
                  <td className="py-2 whitespace-nowrap">{momento(e.updatedAt)}</td>
                </tr>
              ))}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted-foreground">No hay nombres con ese filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {sueltosVisibles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nombres sin origen ({sueltosVisibles.length})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="mb-2 text-muted-foreground">
              Llegaron solo con el IMEI. No se copian a Túnel, ThermoKing ni StarCool hasta que alguien asigne el nombre en el listado.
            </p>
            <ul className="space-y-1">
              {sueltosVisibles.map((s) => (
                <li key={s.imei}>
                  <span className="font-mono text-xs">{s.imei}</span> · {s.nombre}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reescrituras y bloqueos ({reescriturasVisibles.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <p className="mb-2 text-sm text-muted-foreground">
            Aquí queda cada vez que un nombre ya puesto fue cambiado, o cuando una sincronización intentó reemplazarlo y se conservó el anterior.
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3">Cuándo</th>
                <th className="py-2 pr-3">IMEI</th>
                <th className="py-2 pr-3">Origen</th>
                <th className="py-2 pr-3">Anterior</th>
                <th className="py-2 pr-3">Nuevo</th>
                <th className="py-2 pr-3">Qué pasó</th>
                <th className="py-2">Quién</th>
              </tr>
            </thead>
            <tbody>
              {reescriturasVisibles.map((e) => (
                <tr key={e.id} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{momento(e.changedAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.imei}</td>
                  <td className="py-2 pr-3">{etiquetaFamilia(e.familia || e.codigo)}</td>
                  <td className="py-2 pr-3">{e.nombreAnterior}</td>
                  <td className="py-2 pr-3">{e.nombreNuevo}</td>
                  <td className="py-2 pr-3">
                    {e.aplicado === false ? 'No se cambió. ' : 'Se actualizó. '}
                    {e.motivo || e.origen || ''}
                  </td>
                  <td className="py-2">{e.usuario || '—'}</td>
                </tr>
              ))}
              {!cargando && reescriturasVisibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-muted-foreground">Todavía no hay reescrituras.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
