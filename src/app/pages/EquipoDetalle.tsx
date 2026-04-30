import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import { dispositivoTieneHistorialOficial } from '../api/datosOficiales';
import { HistorialOficialDetalle } from '../components/HistorialOficialDetalle';
import type {
  DispositivoUltimoEstado,
  UltimoDatoDispositivo,
  UltimoEstadoDispositivosResponse,
} from '../types';
import { useAuth } from '../AuthContext';
import { readDeviceLocalNames } from '../lib/deviceLocalNames';
import {
  userMayAccessImei,
  displayNameForDevice,
} from '../modules/usuario';
import {
  nivelCo2O2Valido,
  textoEstadoPowerState,
  formatearNumero,
  telemetriaComparablePayload,
} from '../lib/telemetriaDetalle';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../components/ui/utils';
import {
  ArrowLeft,
  Thermometer,
  Wind,
  Snowflake,
  Droplets,
  Flame,
  Leaf,
  Activity,
  Cpu,
  Zap,
  Bell,
  Settings2,
  Power,
  Percent,
  Target,
  Radio,
  Container,
  MapPin,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function deviceRowKey(d: DispositivoUltimoEstado): string {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

type IconLucide = React.ComponentType<{ className?: string }>;

interface DetalleItem {
  id: string;
  label: string;
  Icon: IconLucide;
  iconClass: string;
  value: string;
}

function buildDetalleItems(d: UltimoDatoDispositivo): DetalleItem[] {
  const co2 = nivelCo2O2Valido(d.co2_reading);
  const o2 = nivelCo2O2Valido(d.o2_reading);

  const items: DetalleItem[] = [
    {
      id: 'set_point',
      label: 'Set Temperatura',
      Icon: Target,
      iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
      value: formatearNumero(d.set_point, ' °C'),
    },
    {
      id: 'temp_supply_1',
      label: 'T. Suministro',
      Icon: Thermometer,
      iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      value: formatearNumero(d.temp_supply_1, ' °C'),
    },
    {
      id: 'return_air',
      label: 'T. Retorno',
      Icon: Wind,
      iconClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
      value: formatearNumero(d.return_air, ' °C'),
    },
    {
      id: 'evaporation_coil',
      label: 'Evaporador',
      Icon: Snowflake,
      iconClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      value: formatearNumero(d.evaporation_coil, ' °C'),
    },
    {
      id: 'condensation_coil',
      label: 'Condensador',
      Icon: Droplets,
      iconClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      value: formatearNumero(d.condensation_coil, ' °C'),
    },
    {
      id: 'compress_coil_1',
      label: 'T. Compresor',
      Icon: Flame,
      iconClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
      value: formatearNumero(d.compress_coil_1, ' °C'),
    },
    {
      id: 'co2_reading',
      label: 'Nivel de CO₂',
      Icon: Leaf,
      iconClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      value: co2 == null ? 'Nulo' : String(co2),
    },
    {
      id: 'o2_reading',
      label: 'Nivel de oxígeno',
      Icon: Activity,
      iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      value: o2 == null ? 'Nulo' : String(o2),
    },
    {
      id: 'cargo_1_temp',
      label: 'Sensor 1',
      Icon: Cpu,
      iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      value: formatearNumero(d.cargo_1_temp, ' °C'),
    },
    {
      id: 'cargo_2_temp',
      label: 'Sensor 2',
      Icon: Cpu,
      iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      value: formatearNumero(d.cargo_2_temp, ' °C'),
    },
    {
      id: 'cargo_3_temp',
      label: 'Sensor 3',
      Icon: Cpu,
      iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      value: formatearNumero(d.cargo_3_temp, ' °C'),
    },
    {
      id: 'cargo_4_temp',
      label: 'Sensor 4',
      Icon: Cpu,
      iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      value: formatearNumero(d.cargo_4_temp, ' °C'),
    },
    {
      id: 'power_kwh',
      label: 'Consumo',
      Icon: Zap,
      iconClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      value: formatearNumero(d.power_kwh, ' kWh'),
    },
    {
      id: 'numero_alarma',
      label: 'Alarmas',
      Icon: Bell,
      iconClass: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      value:
        d.numero_alarma == null || Number.isNaN(d.numero_alarma)
          ? '—'
          : String(d.numero_alarma),
    },
    {
      id: 'sp_ethyleno',
      label: 'Set etileno',
      Icon: Settings2,
      iconClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      value: formatearNumero(d.sp_ethyleno),
    },
    {
      id: 'set_point_o2',
      label: 'Set de O₂',
      Icon: Settings2,
      iconClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      value: formatearNumero(d.set_point_o2),
    },
    {
      id: 'set_point_co2',
      label: 'Set de CO₂',
      Icon: Settings2,
      iconClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      value: formatearNumero(d.set_point_co2),
    },
    {
      id: 'power_state',
      label: 'Estado',
      Icon: Power,
      iconClass: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300',
      value: textoEstadoPowerState(d.power_state),
    },
    {
      id: 'capacity_load',
      label: 'Potencia',
      Icon: Percent,
      iconClass: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
      value:
        d.capacity_load == null || Number.isNaN(d.capacity_load)
          ? '—'
          : `${d.capacity_load} %`,
    },
  ];

  return items;
}

const PRINCIPAL_IDS_ORDER = [
  'set_point',
  'temp_supply_1',
  'return_air',
  'evaporation_coil',
  'compress_coil_1',
  'capacity_load',
] as const;

function partitionDetalleItems(d: UltimoDatoDispositivo): {
  principal: DetalleItem[];
  extra: DetalleItem[];
} {
  const all = buildDetalleItems(d);
  const orderIdx = new Map<string, number>(
    PRINCIPAL_IDS_ORDER.map((id, i) => [id, i])
  );
  const principal = all
    .filter((i) => orderIdx.has(i.id))
    .sort((a, b) => orderIdx.get(a.id)! - orderIdx.get(b.id)!);
  const extra = all.filter((i) => !orderIdx.has(i.id));
  return { principal, extra };
}

function matchPassedDevice(
  state: unknown,
  imei: string,
  codigoParam: string
): DispositivoUltimoEstado | null {
  if (!imei) return null;
  const d = (state as { dispositivo?: DispositivoUltimoEstado } | null)
    ?.dispositivo;
  if (!d || d.imei !== imei) return null;
  if (codigoParam && d.codigo !== codigoParam) return null;
  return d;
}

function findDeviceInResponse(
  response: UltimoEstadoDispositivosResponse,
  imei: string,
  codigoParam: string
): DispositivoUltimoEstado | null {
  const list = response.data.dispositivos;
  return (
    list.find((row) => {
      if (row.imei !== imei) return false;
      if (!codigoParam) return true;
      return row.codigo === codigoParam;
    }) ?? null
  );
}

export default function EquipoDetalle() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const imei = searchParams.get('imei') ?? '';
  const codigoParam = searchParams.get('codigo') ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const localNames = useMemo(() => readDeviceLocalNames(), []);

  const passedDevice = useMemo(
    () => matchPassedDevice(location.state, imei, codigoParam),
    [location.state, imei, codigoParam]
  );

  const [dispositivo, setDispositivo] = useState<DispositivoUltimoEstado | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshMensaje, setRefreshMensaje] = useState<string | null>(null);
  const [verMasAbierto, setVerMasAbierto] = useState(false);

  const fetchDispositivoActual = useCallback(
    async (): Promise<DispositivoUltimoEstado | null> => {
      const response = await fetchUltimoEstadoDispositivos();
      return findDeviceInResponse(response, imei, codigoParam);
    },
    [imei, codigoParam]
  );

  useEffect(() => {
    if (!imei) {
      setError('Falta el parámetro IMEI');
      setLoading(false);
      return;
    }
    if (passedDevice) {
      setDispositivo(passedDevice);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await fetchDispositivoActual();
        if (cancelled) return;
        setDispositivo(found);
        if (!found) {
          setError('No se encontró el equipo con ese IMEI y origen.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al cargar');
          setDispositivo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imei, codigoParam, passedDevice, fetchDispositivoActual]);

  const consultarActualizacion = useCallback(
    async (pantallaCompleta = false) => {
      if (!imei) return;
      setRefreshMensaje(null);
      if (pantallaCompleta) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const found = await fetchDispositivoActual();
        if (!found) {
          setError('No se encontró el equipo con ese IMEI y origen.');
          return;
        }
        let sinCambios = false;
        setDispositivo((prev) => {
          if (
            prev != null &&
            telemetriaComparablePayload(prev) ===
              telemetriaComparablePayload(found)
          ) {
            sinCambios = true;
            return prev;
          }
          return found;
        });
        setRefreshMensaje(
          sinCambios ? 'Sin cambios respecto a la última lectura.' : null
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar');
      } finally {
        if (pantallaCompleta) setLoading(false);
        else setRefreshing(false);
      }
    },
    [imei, fetchDispositivoActual]
  );

  const sinAcceso =
    dispositivo != null && user != null && !userMayAccessImei(user, dispositivo.imei);

  const nombreMostrado = useMemo(() => {
    if (dispositivo == null) return '';
    const rk = deviceRowKey(dispositivo);
    return displayNameForDevice(user, dispositivo.imei, rk, localNames, SIN_ASIGNAR);
  }, [dispositivo, user, localNames]);

  const { principal: detallePrincipal, extra: detalleExtra } = useMemo(() => {
    if (dispositivo == null) return { principal: [], extra: [] };
    return partitionDetalleItems(dispositivo.ultimo_dato);
  }, [dispositivo]);

  if (!imei) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link to="/listado">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <p className="text-muted-foreground">Enlace inválido: falta IMEI.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Cargando detalle del equipo…</p>
      </div>
    );
  }

  if (error || dispositivo == null) {
    return (
      <div className="space-y-6">
        <Button variant="outline" asChild>
          <Link to="/listado">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{error ?? 'Equipo no encontrado'}</p>
            <Button
              variant="link"
              className="px-0 h-auto mt-2"
              onClick={() => consultarActualizacion(true)}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (sinAcceso) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link to="/listado">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <p className="text-muted-foreground">No tiene permiso para ver este equipo.</p>
      </div>
    );
  }

  const tituloPrincipal =
    nombreMostrado === SIN_ASIGNAR ? dispositivo.imei : nombreMostrado;
  const mostrarImeiSecundario =
    nombreMostrado !== SIN_ASIGNAR && nombreMostrado !== dispositivo.imei;
  const ud = dispositivo.ultimo_dato;
  const tieneUbicacion =
    ud.latitud != null &&
    ud.longitud != null &&
    !(ud.latitud === 0 && ud.longitud === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Button variant="outline" asChild className="w-fit">
          <Link to="/listado">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al listado
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => consultarActualizacion(false)}
          disabled={refreshing}
          className="w-fit sm:ml-auto"
        >
          <RefreshCw
            className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')}
          />
          Actualizar
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Container className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{tituloPrincipal}</h1>
              {mostrarImeiSecundario && (
                <span className="text-sm text-muted-foreground font-mono">
                  IMEI {dispositivo.imei}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              {dispositivo.codigo != null && (
                <Badge variant="outline" className="font-mono">
                  <Radio className="h-3 w-3 mr-1" />
                  {dispositivo.codigo}
                </Badge>
              )}
              <Badge
                className={cn(
                  dispositivo.estado_conexion === 'online' && 'bg-green-600',
                  dispositivo.estado_conexion === 'wait' && 'bg-yellow-600',
                  dispositivo.estado_conexion === 'offline' && 'bg-red-600'
                )}
              >
                {dispositivo.estado_conexion.toUpperCase()}
              </Badge>
              {dispositivo.en_defrost === true && (
                <Badge variant="secondary">Defrost</Badge>
              )}
              {tieneUbicacion && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() =>
                    navigate(`/ubicanos?lat=${ud.latitud}&lng=${ud.longitud}`)
                  }
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Mapa
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Última actualización:{' '}
              {dispositivo.ultima_actualizacion
                ? new Date(dispositivo.ultima_actualizacion).toLocaleString('es-ES')
                : '—'}
              {dispositivo.minutos_desde_ultimo_dato != null && (
                <> · hace {dispositivo.minutos_desde_ultimo_dato} min</>
              )}
            </p>
            {refreshMensaje != null && (
              <p className="text-sm text-muted-foreground italic">{refreshMensaje}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Telemetría principal</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set temperatura, suministro, retorno, evaporador, compresor y potencia.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {detallePrincipal.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden transition-shadow hover:shadow-md border-primary/15"
            >
              <CardContent className="p-5 flex gap-4 items-start">
                <div
                  className={cn(
                    'flex h-16 w-16 shrink-0 items-center justify-center rounded-xl',
                    item.iconClass
                  )}
                >
                  <item.Icon className="h-8 w-8" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums leading-tight break-words">
                    {item.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {detalleExtra.length > 0 && (
          <div className="mt-6 space-y-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setVerMasAbierto((v) => !v)}
            >
              {verMasAbierto ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Ver más datos
                </>
              )}
            </Button>
            {verMasAbierto && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
                {detalleExtra.map((item) => (
                  <Card
                    key={item.id}
                    className="overflow-hidden transition-shadow hover:shadow-md"
                  >
                    <CardContent className="p-4 flex gap-4 items-start">
                      <div
                        className={cn(
                          'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl',
                          item.iconClass
                        )}
                      >
                        <item.Icon className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="text-xl font-semibold tabular-nums leading-tight break-words">
                          {item.value}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {dispositivoTieneHistorialOficial(dispositivo.codigo) && (
        <HistorialOficialDetalle
          imei={dispositivo.imei}
          codigo={dispositivo.codigo}
          nombreContenedor={tituloPrincipal}
        />
      )}
    </div>
  );
}
