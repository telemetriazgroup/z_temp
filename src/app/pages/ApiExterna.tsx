import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { DemoConexion } from './DemoConexion';
import { GuiaApi } from './GuiaApi';

const ADMIN = '/reefer/api/correo/api-externa';

interface CuentaApi {
  id: string;
  username: string;
  nombre: string;
  category: string;
  flotaCompleta: boolean;
  enabled: boolean;
  prefix: string | null;
  allowIps: string[];
  lastUsedAt: string | null;
  requestCount: number;
}

function headers(username: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-ZTrack-User': username };
}

async function leerJson<T>(res: Response): Promise<T & { ok?: boolean; error?: string; clave?: string }> {
  const body = (await res.json()) as T & { ok?: boolean; error?: string; clave?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `Error ${res.status}`);
  return body;
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

export default function ApiExterna() {
  const { user } = useAuth();
  const isSuper = userIsSuperAdmin(user);
  const [cuentas, setCuentas] = useState<CuentaApi[]>([]);
  const [filtro, setFiltro] = useState('');
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const [ips, setIps] = useState('');
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const [claveDe, setClaveDe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [pestana, setPestana] = useState<'cuentas' | 'demo' | 'guia'>('demo');

  const basePublica = `${window.location.origin}/reefer/api/v1`;

  const cargar = useCallback(async () => {
    if (!user?.username || !isSuper) return;
    setError(null);
    const res = await fetch(`${ADMIN}/cuentas`, { headers: headers(user.username) });
    const body = await leerJson<{ data: CuentaApi[] }>(res);
    setCuentas(body.data);
  }, [user?.username, isSuper]);

  useEffect(() => {
    if (!isSuper) return;
    cargar()
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setCargando(false));
  }, [cargar, isSuper]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter((c) =>
      `${c.username} ${c.nombre} ${c.category}`.toLowerCase().includes(q)
    );
  }, [cuentas, filtro]);

  const elegida = cuentas.find((c) => c.id === elegidaId) ?? null;

  function elegir(cuenta: CuentaApi) {
    setElegidaId(cuenta.id);
    setIps((cuenta.allowIps || []).join('\n'));
    setAviso(null);
  }

  async function actuar(path: string, method: string, body?: unknown) {
    if (!user?.username || !elegida) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`${ADMIN}/cuentas/${encodeURIComponent(elegida.id)}${path}`, {
        method,
        headers: headers(user.username),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await leerJson<{ clave?: string }>(res);
      if (data.clave) {
        setClaveNueva(data.clave);
        setClaveDe(elegida.username);
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  }

  async function copiarClave() {
    if (!claveNueva) return;
    try {
      await navigator.clipboard.writeText(claveNueva);
      setAviso('Clave copiada. No se volverá a mostrar.');
    } catch {
      setAviso('Seleccione la clave y cópiela. El navegador no permitió copiarla solo.');
    }
  }

  if (!isSuper) return <Navigate to="/" replace />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <KeyRound className="h-6 w-6" />
          API externa
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Otro programa consulta aquí la telemetría y arma su propia tabla y gráfica. ZTRACK es el
          único acceso. Una cuenta habilitada ve su flota. Una conexión demo dura las horas o los
          días que indique y solo ve los equipos que usted elija.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={pestana === 'demo' ? 'default' : 'outline'} onClick={() => setPestana('demo')}>
          Conexión demo
        </Button>
        <Button type="button" variant={pestana === 'cuentas' ? 'default' : 'outline'} onClick={() => setPestana('cuentas')}>
          Cuentas
        </Button>
        <Button type="button" variant={pestana === 'guia' ? 'default' : 'outline'} onClick={() => setPestana('guia')}>
          Guía de uso
        </Button>
      </div>

      {pestana === 'cuentas' && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contrato para integrar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Base: <code className="text-xs">{basePublica}</code>
          </p>
          <p>
            Autenticación: <code className="text-xs">Authorization: Bearer ztk_…</code>. También acepta{' '}
            <code className="text-xs">X-Api-Key</code>. Solo lectura. Hora de las fechas sin zona:{' '}
            <strong>America/Lima</strong>. Cada punto trae <code>fecha</code> en UTC y{' '}
            <code>fecha_lima</code> para la tabla.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-5">{`curl -s -H "Authorization: Bearer CLAVE" \\
  "${basePublica}/equipos"

curl -s -H "Authorization: Bearer CLAVE" \\
  "${basePublica}/equipos/TUNEL/IMEI"

curl -s -H "Authorization: Bearer CLAVE" \\
  "${basePublica}/equipos/TUNEL/IMEI/historial?horas=12"`}</pre>
          <p>
            El listado trae nombre, IMEI, origen, marca, conexión, encendido, setpoint, suministro,
            retorno, ambiente, evaporador, humedad, CO₂, O₂, en rango, deshielo, alarmas y ubicación.
            El historial usa los mismos campos de temperatura, uno por trama, para la gráfica.
            Origen: <code>TUNEL</code>, <code>TERMOKING</code>, <code>STARCOOL</code> o{' '}
            <code>STARCOOL2</code>. El rango máximo es 7 días. También se puede pedir{' '}
            <code>desde</code> y <code>hasta</code>.
          </p>
          <p className="text-muted-foreground">
            Límite: 120 solicitudes por minuto y 30 historiales por minuto. Si la clave tiene IP
            permitidas, el resto se rechaza. Al revocar o rotar, la clave anterior deja de servir
            en el momento.
          </p>
        </CardContent>
      </Card>
      )}

      {claveNueva && (
        <Card className="border-amber-400">
          <CardHeader>
            <CardTitle className="text-base">Clave nueva de {claveDe}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Cópiela ahora y entréguela al programa que va a integrar. ZTRACK no la vuelve a mostrar.
            </p>
            <code className="block break-all rounded-md bg-muted p-3 text-xs">{claveNueva}</code>
            <div className="flex gap-2">
              <Button type="button" onClick={copiarClave}>
                Copiar clave
              </Button>
              <Button type="button" variant="outline" onClick={() => setClaveNueva(null)}>
                Ya la copié
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      {pestana === 'guia' && <GuiaApi base={basePublica} />}
      {pestana === 'demo' && user?.username && (
        <DemoConexion
          username={user.username}
          onClave={(clave, nombre) => {
            setClaveNueva(clave);
            setClaveDe(nombre);
          }}
        />
      )}

      {pestana === 'cuentas' && (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Cuentas</CardTitle>
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar cuenta"
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Cuenta</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Clave</th>
                    <th className="px-4 py-2 font-medium">Último uso</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando && (
                    <tr>
                      <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                        Cargando cuentas…
                      </td>
                    </tr>
                  )}
                  {!cargando && visibles.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                        No hay cuentas con ese filtro.
                      </td>
                    </tr>
                  )}
                  {visibles.map((cuenta) => (
                    <tr
                      key={cuenta.id}
                      className={`border-b cursor-pointer hover:bg-muted/50 ${
                        cuenta.id === elegidaId ? 'bg-muted/60' : ''
                      }`}
                      onClick={() => elegir(cuenta)}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium">{cuenta.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {cuenta.username} · {cuenta.category}
                          {cuenta.flotaCompleta ? ' · flota completa' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {cuenta.enabled ? (
                          <Badge>Habilitada</Badge>
                        ) : (
                          <Badge variant="outline">Sin API</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{cuenta.prefix ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {momento(cuenta.lastUsedAt)}
                        {cuenta.requestCount > 0 ? ` · ${cuenta.requestCount}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {elegida ? elegida.username : 'Elija una cuenta'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!elegida && (
              <p className="text-sm text-muted-foreground">
                Al habilitar se genera una clave. El otro programa la envía en cada consulta y recibe
                solo los equipos de esa cuenta.
              </p>
            )}
            {elegida && (
              <>
                {elegida.flotaCompleta && (
                  <p className="text-sm text-amber-700">
                    Esta cuenta ve toda la flota. La clave podrá leer todos los equipos.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!elegida.enabled ? (
                    <Button type="button" disabled={ocupado} onClick={() => actuar('/habilitar', 'POST')}>
                      Habilitar y generar clave
                    </Button>
                  ) : (
                    <>
                      <Button type="button" disabled={ocupado} onClick={() => actuar('/rotar', 'POST')}>
                        Rotar clave
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => actuar('/revocar', 'POST')}
                      >
                        Revocar
                      </Button>
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">IP permitidas</p>
                  <p className="text-xs text-muted-foreground">
                    Vacío: cualquier origen. Una dirección o red por línea, por ejemplo 190.12.10.4 o
                    190.12.10.0/24.
                  </p>
                  <Textarea
                    value={ips}
                    onChange={(e) => setIps(e.target.value)}
                    rows={4}
                    placeholder="Sin restricción"
                    disabled={!elegida.enabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={ocupado || !elegida.enabled}
                    onClick={() =>
                      actuar('/ips', 'PUT', {
                        ips: ips
                          .split(/[\s,;]+/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  >
                    Guardar IP
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
