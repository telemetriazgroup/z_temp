import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';
import type {
  UltimoEstadoDispositivosResponse,
  DispositivoUltimoEstado,
  DispositivoOrigenCodigo,
} from '../types';
import {
  readDeviceLocalNames,
  persistDeviceLocalNames,
  recordDeviceLocalNameChange,
  getDeviceLocalNameHistoryForRow,
  refreshDeviceNamesFromServer,
  applyServerDeviceNameHistory,
  type DeviceLocalNameMap,
  type DeviceLocalNameHistoryEntry,
} from '../lib/deviceLocalNames';
import {
  saveDeviceNameOnServer,
  fetchDeviceNameHistoryFromServer,
  fetchDeviceAlertConfigMap,
} from '../modules/correo/correoServerApi';
import {
  usaRangoPersonalizado,
  evaluarEstadoRangoListado,
  computeRangoLimites,
} from '../modules/correo/rangoTemperatura';
import type { DeviceAlertConfig } from '../modules/correo/types';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { useAuth } from '../AuthContext';
import { useT } from '../i18n';
import {
  userMayAccessDispositivo,
  displayNameForDevice,
  postAuditEvent,
} from '../modules/usuario';
import { AUDIT_ACTIONS } from '../modules/usuario/auditActions';
import { InicioDataSplash } from '../components/InicioDataSplash';
import {
  ensureAlarmCatalog,
  resolveAlarmDisplayLabel,
  extractActiveAlarmCodes,
} from '../modules/alarma';
import { cn } from '../components/ui/utils';
import { exportEquipoUltimoEstadoJson } from '../lib/exportEquipoJson';
import {
  formatTemperatura,
  normalizeTemperaturaUnidad,
  tendenciaHaciaRango,
  tendenciaRangoPorFlujo,
  type TendenciaRango,
} from '../lib/temperatureUnit';
import { TempConTendenciaRango } from '../components/TempConTendencia';
import {
  RefreshCw,
  AlertCircle,
  Pencil,
  Download,
  History,
  Info,
} from 'lucide-react';
import { Historial3hModal, type Historial3hTarget } from '../components/Historial3hModal';
import { dispositivoTieneHistorialOficial } from '../api/datosOficiales';
import {
  useDispositivosFleet,
  parseFleetStatusParam,
  parseFleetRangoParam,
  type FleetStatusFilter,
  type FleetRangoFilter,
} from '../DispositivosFleetContext';

const API_STATUS_MAP = {
  online: 'ONLINE',
  offline: 'OFFLINE',
  wait: 'WAIT',
} as const;

const API_POWER_MAP = {
  on: 'ON',
  off: 'OFF',
} as const;

const SIN_ASIGNAR = 'SIN ASIGNAR';

type StatusFilter = FleetStatusFilter;
type CodigoFilter = 'ALL' | DispositivoOrigenCodigo;
type RangoFilter = FleetRangoFilter;

const CODIGO_FILTER_OPTIONS: { id: CodigoFilter; label: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'TUNEL', label: 'TUNEL' },
  { id: 'STARCOOL', label: 'STARCOOL' },
  { id: 'STARCOOL2', label: 'STARCOOL2' },
  { id: 'TERMOKING', label: 'TERMOKING' },
];

function deviceRowKey(d: DispositivoUltimoEstado): string {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

function apiStatusOf(device: DispositivoUltimoEstado): 'ONLINE' | 'WAIT' | 'OFFLINE' {
  const mapped =
    API_STATUS_MAP[device.estado_conexion] ??
    (device.estado_conexion?.toUpperCase() as 'ONLINE' | 'WAIT' | 'OFFLINE');
  if (mapped === 'ONLINE' || mapped === 'WAIT' || mapped === 'OFFLINE') return mapped;
  return 'OFFLINE';
}

function formatDate(dateString: string | null): string {
  if (dateString == null) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date
    .toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    .replace(',', '');
}

function getStatusColor(
  status: 'ONLINE' | 'WAIT' | 'OFFLINE'
): string {
  switch (status) {
    case 'ONLINE':
      return 'bg-green-600';
    case 'WAIT':
      return 'bg-yellow-600';
    case 'OFFLINE':
      return 'bg-red-600';
    default:
      return 'bg-gray-600';
  }
}

function getPowerColor(power: string): string {
  return power === 'ON' ? 'bg-green-600' : 'bg-gray-600';
}

const STATUS_FILTER_OPTIONS = [
  { id: 'ALL' as const, label: 'Todos' },
  { id: 'ONLINE' as const, label: 'Online' },
  { id: 'WAIT' as const, label: 'Wait' },
  { id: 'OFFLINE' as const, label: 'Offline' },
] as const;

const RANGO_FILTER_OPTIONS = [
  { id: 'ALL' as const, label: 'Todos' },
  { id: 'en' as const, label: 'En rango' },
  { id: 'fuera' as const, label: 'Fuera de rango' },
  { id: 'apagado' as const, label: 'Apagado' },
] as const;

function mapDeviceToDisplay(
  d: DispositivoUltimoEstado,
  alertCfg?: DeviceAlertConfig | null
) {
  const status = apiStatusOf(d);
  const power =
    d.power_state_texto != null
      ? (API_POWER_MAP[d.power_state_texto] ?? 'OFF')
      : '—';
  const rawAlarmSlots = extractActiveAlarmCodes(d.ultimo_dato);
  const alarmActive = rawAlarmSlots.length > 0;
  const alarmCode = alarmActive ? rawAlarmSlots[0].code : null;
  const alarmTitle =
    alarmCode != null
      ? resolveAlarmDisplayLabel(null, alarmCode, { technical: false })
      : null;
  const alarmCount = rawAlarmSlots.length;
  const lat = d.ultimo_dato?.latitud ?? null;
  const lng = d.ultimo_dato?.longitud ?? null;
  const setPoint = d.ultimo_dato?.set_point ?? null;
  const returnAir = d.ultimo_dato?.return_air ?? null;
  const tempSupply1 = d.ultimo_dato?.temp_supply_1 ?? null;
  const codigo = d.codigo ?? '—';
  const estadoRango = evaluarEstadoRangoListado(d, alertCfg);
  const enRangoPersonalizado = usaRangoPersonalizado(alertCfg);
  return {
    rowKey: deviceRowKey(d),
    id: d.imei,
    codigo,
    containerId: d.imei,
    status,
    power,
    ultimaConexion: d.ultima_actualizacion,
    alarmas: alarmCount,
    alarmCode,
    alarmTitle,
    alarmCount,
    hasUbicacion: lat != null && lng != null && !(lat === 0 && lng === 0),
    lat: lat ?? 0,
    lng: lng ?? 0,
    setPoint,
    returnAir,
    tempSupply1,
    estadoRango,
    enRango:
      estadoRango === 'normal' ? true : estadoRango === 'fuera' ? false : null,
    enRangoPersonalizado,
  };
}

function formatTemp(
  value: number | null,
  unidad: ReturnType<typeof normalizeTemperaturaUnidad> = 'C'
): string {
  return formatTemperatura(value, unidad);
}

type ListDevice = ReturnType<typeof mapDeviceToDisplay> & {
  nombreAsignado: string;
  nameLockedByProfile: boolean;
  imei: string;
  raw: DispositivoUltimoEstado;
};

function RangoBadge({
  device,
}: {
  device: Pick<ListDevice, 'estadoRango' | 'enRangoPersonalizado'>;
}) {
  return (
    <div
      className={cn(
        (device.estadoRango === 'fuera' || device.estadoRango === 'apagado') &&
          'rounded px-1.5 py-0.5 bg-red-600/15 text-red-900 dark:text-red-100'
      )}
      title={
        device.enRangoPersonalizado && device.estadoRango !== 'apagado'
          ? 'Evaluado con rango EN RANGO personalizado'
          : device.estadoRango === 'apagado'
            ? 'Equipo apagado'
            : undefined
      }
    >
      {device.estadoRango === 'normal' && (
        <Badge className="bg-emerald-600 hover:bg-emerald-600">NORMAL</Badge>
      )}
      {device.estadoRango === 'fuera' && (
        <Badge className="bg-red-600 hover:bg-red-600">FUERA</Badge>
      )}
      {device.estadoRango === 'apagado' && (
        <Badge className="bg-gray-700 hover:bg-gray-700">APAGADO</Badge>
      )}
      {device.estadoRango === 'indeterminado' && (
        <span className="text-muted-foreground text-xs">—</span>
      )}
    </div>
  );
}

function DeviceInfoPopover({
  device,
}: {
  device: Pick<ListDevice, 'codigo' | 'status' | 'containerId'>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label="Ver código, status e IMEI"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Info className="h-4 w-4" />
      </Button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-label="Información del equipo"
              className="w-full max-w-sm rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium">Información del equipo</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t('listado.status')}</span>
                <Badge className={getStatusColor(device.status)}>
                  {device.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t('listado.code')}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {device.codigo}
                </Badge>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">
                  {t('listado.imei')} / Container ID
                </span>
                <p className="font-mono text-sm break-all leading-snug">
                  {device.containerId || '—'}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Clic fuera para cerrar
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

type TempSnapshot = {
  returnAir: number | null;
  tempSupply1: number | null;
  setPoint: number | null;
  stamp: string | null;
};

function stampOfDevice(d: DispositivoUltimoEstado): string | null {
  const ud = d.ultimo_dato;
  if (!ud) return null;
  return (
    ud.created_at ??
    (ud.telemetria_id != null ? String(ud.telemetria_id) : null) ??
    d.ultima_actualizacion
  );
}

export default function Listado() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseFleetStatusParam(searchParams.get('status'))
  );
  const [rangoFilter, setRangoFilter] = useState<RangoFilter>(() =>
    parseFleetRangoParam(searchParams.get('rango'))
  );
  const [codigoFilter, setCodigoFilter] = useState<CodigoFilter>('ALL');
  const [localNames, setLocalNames] = useState<DeviceLocalNameMap>(() =>
    readDeviceLocalNames()
  );
  const [nameHistory, setNameHistory] = useState<DeviceLocalNameHistoryEntry[]>([]);
  const [nameEdit, setNameEdit] = useState<{
    rowKey: string;
    containerId: string;
    codigo: string;
    nombreAnterior: string;
    draft: string;
  } | null>(null);
  const [historial3h, setHistorial3h] = useState<Historial3hTarget | null>(null);
  const [alertConfigMap, setAlertConfigMap] = useState<Record<string, DeviceAlertConfig>>({});
  const [alertLoading, setAlertLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const tempUnidad = normalizeTemperaturaUnidad(user?.temperaturaUnidad);
  const esSuperUser = user?.superUser === true;
  const {
    data,
    loading: fleetLoading,
    error: fleetError,
    fetchedAt,
    ensureFleet,
    refreshFleet,
    isStale,
  } = useDispositivosFleet();

  const prevTempsRef = useRef<Record<string, TempSnapshot>>({});
  const [tendenciasByRow, setTendenciasByRow] = useState<
    Record<string, { retorno: TendenciaRango; suministro: TendenciaRango }>
  >({});

  useEffect(() => {
    const dispositivos = data?.data?.dispositivos;
    if (!dispositivos?.length) return;

    const nextTend: Record<
      string,
      { retorno: TendenciaRango; suministro: TendenciaRango }
    > = {};
    const nextPrev: Record<string, TempSnapshot> = { ...prevTempsRef.current };

    for (const d of dispositivos) {
      const rk = deviceRowKey(d);
      const cfg = alertConfigMap[rk] ?? null;
      const setPoint = d.ultimo_dato?.set_point ?? null;
      const returnAir = d.ultimo_dato?.return_air ?? null;
      const tempSupply1 = d.ultimo_dato?.temp_supply_1 ?? null;
      const stamp = stampOfDevice(d);
      const rango = computeRangoLimites(setPoint, cfg);
      const prev = prevTempsRef.current[rk];

      let retorno: TendenciaRango = null;
      let suministro: TendenciaRango = null;

      if (prev && prev.stamp != null && stamp != null && prev.stamp !== stamp) {
        retorno = tendenciaHaciaRango(
          returnAir,
          prev.returnAir,
          rango?.min ?? null,
          rango?.max ?? null,
          setPoint
        );
        suministro = tendenciaHaciaRango(
          tempSupply1,
          prev.tempSupply1,
          rango?.min ?? null,
          rango?.max ?? null,
          setPoint
        );
      }

      if (retorno == null || retorno === 'flat') {
        const flujo = tendenciaRangoPorFlujo(
          returnAir,
          setPoint,
          rango?.min ?? null,
          rango?.max ?? null,
          tempSupply1,
          returnAir
        );
        if (flujo) retorno = flujo;
      }
      if (suministro == null || suministro === 'flat') {
        const flujo = tendenciaRangoPorFlujo(
          tempSupply1,
          setPoint,
          rango?.min ?? null,
          rango?.max ?? null,
          tempSupply1,
          returnAir
        );
        if (flujo) suministro = flujo;
      }

      nextTend[rk] = { retorno, suministro };
      nextPrev[rk] = { returnAir, tempSupply1, setPoint, stamp };
    }

    prevTempsRef.current = nextPrev;
    setTendenciasByRow(nextTend);
  }, [data, alertConfigMap]);

  const syncFiltersToUrl = useCallback(
    (status: StatusFilter, rango: RangoFilter) => {
      const next = new URLSearchParams();
      if (status !== 'ALL') next.set('status', status);
      if (rango !== 'ALL') next.set('rango', rango);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    setStatusFilter(parseFleetStatusParam(searchParams.get('status')));
    setRangoFilter(parseFleetRangoParam(searchParams.get('rango')));
  }, [searchParams]);

  useEffect(() => {
    if (!user?.username) return;
    void postAuditEvent(user.username, {
      action: AUDIT_ACTIONS.DEVICE_VIEW_LIST,
      module: 'listado',
      summary: 'Consultó listado de dispositivos',
      detail: {
        status: statusFilter,
        rango: rangoFilter,
      },
    });
    // una vez por visita a la pantalla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  const load = useCallback(
    async (force = false) => {
      setAlertLoading(true);
      try {
        const [, alertCfg] = await Promise.all([
          ensureFleet({ force }),
          fetchDeviceAlertConfigMap().catch(
            () => ({} as Record<string, DeviceAlertConfig>)
          ),
        ]);
        ensureAlarmCatalog();
        setAlertConfigMap(alertCfg);
      } finally {
        setAlertLoading(false);
      }
    },
    [ensureFleet]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    void refreshDeviceNamesFromServer()
      .then(setLocalNames)
      .catch(() => {
        setLocalNames(readDeviceLocalNames());
      });
  }, []);

  const dispositivos = data?.data?.dispositivos ?? [];
  const loading = (fleetLoading && !data) || alertLoading;
  const error = fleetError;

  const visibleDispositivos = useMemo(
    () => dispositivos.filter((d) => userMayAccessDispositivo(user, d)),
    [dispositivos, user]
  );

  const codigoCounts = useMemo(() => {
    const counts: Record<DispositivoOrigenCodigo, number> = {
      TUNEL: 0,
      STARCOOL: 0,
      STARCOOL2: 0,
      TERMOKING: 0,
    };
    for (const d of visibleDispositivos) {
      if (d.codigo != null && d.codigo in counts) counts[d.codigo]++;
    }
    return counts;
  }, [visibleDispositivos]);

  const filteredDevices = visibleDispositivos
    .filter((device) => {
      if (codigoFilter !== 'ALL' && device.codigo !== codigoFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && apiStatusOf(device) !== statusFilter) {
        return false;
      }
      if (rangoFilter !== 'ALL') {
        const rk = deviceRowKey(device);
        const estado = evaluarEstadoRangoListado(
          device,
          alertConfigMap[rk] ?? null
        );
        if (rangoFilter === 'en' && estado !== 'normal') return false;
        if (rangoFilter === 'fuera' && estado !== 'fuera') return false;
        if (rangoFilter === 'apagado' && estado !== 'apagado') return false;
      }
      const search = searchTerm.toLowerCase();
      const codigo = (device.codigo ?? '').toLowerCase();
      const rk = deviceRowKey(device);
      const assigned = displayNameForDevice(
        user,
        device.imei,
        rk,
        localNames,
        SIN_ASIGNAR
      ).toLowerCase();
      return (
        device.imei.toLowerCase().includes(search) ||
        codigo.includes(search) ||
        assigned.includes(search)
      );
    })
    .map((d) => {
      const rk = deviceRowKey(d);
      const base = mapDeviceToDisplay(d, alertConfigMap[rk] ?? null);
      const nombreAsignado = displayNameForDevice(
        user,
        d.imei,
        base.rowKey,
        localNames,
        SIN_ASIGNAR
      );
      return {
        ...base,
        raw: d,
        nombreAsignado,
        nameLockedByProfile: Boolean(user?.deviceNames?.[d.imei]),
      };
    });

  const saveLocalName = () => {
    if (nameEdit == null) return;
    const trimmed = nameEdit.draft.trim();
    const nombreNuevo = trimmed === '' ? SIN_ASIGNAR : trimmed;
    const { rowKey, containerId: imei, codigo, nombreAnterior } = nameEdit;

    void (async () => {
      try {
        const result = await saveDeviceNameOnServer({
          rowKey,
          imei,
          codigo: codigo !== '—' ? codigo : undefined,
          name: nombreNuevo,
          usuario: user?.username,
        });

        setLocalNames((prev) => {
          const next = { ...prev };
          if (trimmed === '') delete next[rowKey];
          else next[rowKey] = trimmed;
          persistDeviceLocalNames(next);
          return next;
        });

        recordDeviceLocalNameChange({
          rowKey,
          imei,
          codigo: codigo !== '—' ? codigo : undefined,
          nombreAnterior,
          nombreNuevo,
          usuario: user?.username,
          historyEntry: result.historyEntry,
        });
      } catch (e) {
        console.error('Error al guardar nombre en servidor:', e);
      } finally {
        setNameEdit(null);
      }
    })();
  };

  const openNameEdit = (device: {
    rowKey: string;
    containerId: string;
    codigo: string;
    nombreAsignado: string;
  }) => {
    void fetchDeviceNameHistoryFromServer(device.rowKey, 15)
      .then((entries) => {
        applyServerDeviceNameHistory(device.rowKey, entries);
        setNameHistory(entries);
      })
      .catch(() => {
        setNameHistory(getDeviceLocalNameHistoryForRow(device.rowKey, 15));
      });

    setNameEdit({
      rowKey: device.rowKey,
      containerId: device.containerId,
      codigo: device.codigo,
      nombreAnterior: device.nombreAsignado,
      draft:
        localNames[device.rowKey] ??
        (device.nombreAsignado !== SIN_ASIGNAR ? device.nombreAsignado : ''),
    });
  };

  const handleDeviceClick = (deviceId: string) => {
    navigate(`/monitoreo?device=${deviceId}`);
  };

  const goDetalle = (dispositivo: DispositivoUltimoEstado) => {
    const q = new URLSearchParams({ imei: dispositivo.imei });
    const c = dispositivo.codigo ?? '';
    if (c) q.set('codigo', c);
    navigate(`/listado/detalle?${q.toString()}`, {
      state: { dispositivo },
    });
  };

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex flex-col items-center gap-4">
          <AlertCircle className="h-12 w-12 text-red-600" />
          <p className="text-red-800 font-medium">Error al cargar los datos</p>
          <p className="text-red-700 text-sm text-center">{error}</p>
          <Button onClick={() => void load(true)} variant="outline">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InicioDataSplash waitingForData={loading && !data} />
      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground text-sm">
          Preparando listado…
        </div>
      ) : null}
      {data != null && (
      <>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('listado.title')}</h1>
          <p className="text-gray-500 mt-1">
            Gestión de equipos registrados
            {fetchedAt != null && (
              <span className="text-xs text-muted-foreground ml-2">
                · caché{' '}
                {new Date(fetchedAt).toLocaleTimeString('es-PE', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {isStale ? ' (actualizando…)' : ''}
                {' · auto 10 min'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={fleetLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${fleetLoading ? 'animate-spin' : ''}`}
            />
            {t('common.update')}
          </Button>
          <div className="text-right">
            <div className="text-sm text-gray-500">Total de Dispositivos</div>
            <div className="text-3xl font-bold">
              {codigoFilter !== 'ALL' ||
              statusFilter !== 'ALL' ||
              rangoFilter !== 'ALL' ||
              searchTerm.trim()
                ? filteredDevices.length
                : visibleDispositivos.length}
            </div>
            {(codigoFilter !== 'ALL' ||
              statusFilter !== 'ALL' ||
              rangoFilter !== 'ALL' ||
              searchTerm.trim()) && (
              <div className="text-xs text-muted-foreground">
                de {visibleDispositivos.length} visibles
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center flex-wrap">
          <Input
            type="text"
            placeholder={t('listado.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Estado:</span>
            {STATUS_FILTER_OPTIONS.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={statusFilter === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setStatusFilter(id);
                  syncFiltersToUrl(id, rangoFilter);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Rango:</span>
            {RANGO_FILTER_OPTIONS.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={rangoFilter === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setRangoFilter(id);
                  syncFiltersToUrl(statusFilter, id);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Código:</span>
          {CODIGO_FILTER_OPTIONS.map(({ id, label }) => {
            const count =
              id === 'ALL'
                ? visibleDispositivos.length
                : codigoCounts[id as DispositivoOrigenCodigo] ?? 0;
            return (
              <Button
                key={id}
                type="button"
                variant={codigoFilter === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCodigoFilter(id)}
              >
                {label}
                {id !== 'ALL' && (
                  <span className="ml-1.5 text-xs opacity-80">({count})</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Móvil: cartas */}
      <div className="md:hidden space-y-3">
        {filteredDevices.map((device, index) => (
          <div
            key={device.rowKey}
            className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer active:bg-muted/40"
            onClick={() => goDetalle(device.raw)}
          >
            <div className="flex items-start gap-2">
              <span className="mt-1 w-6 shrink-0 text-sm tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="mt-0.5 shrink-0">
                {device.power !== '—' ? (
                  <Badge className={getPowerColor(device.power)}>
                    {device.power}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-0.5">
                  <span
                    className={cn(
                      'font-semibold text-base truncate min-w-0 flex-1',
                      device.nombreAsignado === SIN_ASIGNAR && 'text-muted-foreground'
                    )}
                    title={device.nombreAsignado}
                  >
                    {device.nombreAsignado}
                  </span>
                  <DeviceInfoPopover device={device} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Editar nombre"
                    disabled={device.nameLockedByProfile}
                    onClick={(e) => {
                      e.stopPropagation();
                      openNameEdit(device);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/50 px-1.5 py-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t('listado.set')}
                </div>
                <div className="text-sm font-semibold tabular-nums text-black dark:text-foreground">
                  {formatTemp(device.setPoint, tempUnidad)}
                </div>
              </div>
              <div className="rounded-md bg-muted/50 px-1.5 py-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t('listado.returnTemp')}
                </div>
                <div className="flex justify-center text-sm font-medium tabular-nums">
                  <TempConTendenciaRango
                    texto={formatTemp(device.returnAir, tempUnidad)}
                    tendencia={tendenciasByRow[device.rowKey]?.retorno}
                  />
                </div>
              </div>
              <div className="rounded-md bg-muted/50 px-1.5 py-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t('listado.supply')}
                </div>
                <div className="flex justify-center text-sm font-medium tabular-nums">
                  <TempConTendenciaRango
                    texto={formatTemp(device.tempSupply1, tempUnidad)}
                    tendencia={tendenciasByRow[device.rowKey]?.suministro}
                  />
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <RangoBadge device={device} />
              <span className="text-muted-foreground">
                {formatDate(device.ultimaConexion)}
              </span>
              <Badge
                variant={device.alarmCount > 0 ? 'destructive' : 'secondary'}
                className="tabular-nums"
              >
                {device.alarmCount}
              </Badge>
              <div className="ml-auto flex items-center gap-0.5">
                {dispositivoTieneHistorialOficial(
                  device.raw.codigo as DispositivoOrigenCodigo | undefined
                ) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Ver últimas 3 h"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistorial3h({
                        imei: device.raw.imei,
                        codigo: device.raw.codigo as DispositivoOrigenCodigo,
                        nombre: device.nombreAsignado,
                        zonaHoraria: data?.data?.resumen?.zona_horaria ?? null,
                      });
                    }}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                )}
                {esSuperUser && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Descargar JSON"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportEquipoUltimoEstadoJson(
                        device.raw,
                        device.nombreAsignado
                      );
                      if (user?.username) {
                        void postAuditEvent(user.username, {
                          action: AUDIT_ACTIONS.DOWNLOAD_EQUIPO_JSON,
                          module: 'listado',
                          summary: `Descargó JSON del equipo ${device.imei}`,
                          targetId: device.imei,
                          detail: {
                            imei: device.imei,
                            codigo: device.codigo,
                          },
                        });
                      }
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Escritorio: tabla compacta */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead className="w-[72px]">{t('listado.power')}</TableHead>
                <TableHead className="min-w-[420px] w-[42%]">{t('listado.name')}</TableHead>
                <TableHead>{t('listado.set')}</TableHead>
                <TableHead>{t('listado.returnTemp')}</TableHead>
                <TableHead>{t('listado.supply')}</TableHead>
                <TableHead>En rango</TableHead>
                <TableHead>{t('listado.lastConnection')}</TableHead>
                <TableHead>{t('listado.alarms')}</TableHead>
                <TableHead className="w-[56px]" title="Últimas 3 h">
                  3h
                </TableHead>
                {esSuperUser && <TableHead className="w-[90px]">JSON</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device, index) => (
                <TableRow
                  key={device.rowKey}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => goDetalle(device.raw)}
                >
                  <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    {device.power !== '—' ? (
                      <Badge className={getPowerColor(device.power)}>
                        {device.power}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[420px] max-w-[520px]">
                    <div className="flex items-center gap-0.5">
                      <span
                        className={cn(
                          'truncate hover:text-blue-600 min-w-0 flex-1 font-medium',
                          device.nombreAsignado === SIN_ASIGNAR &&
                            'text-muted-foreground'
                        )}
                        title={device.nombreAsignado}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDeviceClick(device.id);
                        }}
                      >
                        {device.nombreAsignado}
                      </span>
                      <DeviceInfoPopover device={device} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Editar nombre"
                        disabled={device.nameLockedByProfile}
                        onClick={(e) => {
                          e.stopPropagation();
                          openNameEdit(device);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-black dark:text-foreground font-semibold">
                    {formatTemp(device.setPoint, tempUnidad)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <TempConTendenciaRango
                      texto={formatTemp(device.returnAir, tempUnidad)}
                      tendencia={tendenciasByRow[device.rowKey]?.retorno}
                    />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <TempConTendenciaRango
                      texto={formatTemp(device.tempSupply1, tempUnidad)}
                      tendencia={tendenciasByRow[device.rowKey]?.suministro}
                    />
                  </TableCell>
                  <TableCell>
                    <RangoBadge device={device} />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(device.ultimaConexion)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={device.alarmCount > 0 ? 'destructive' : 'secondary'}
                      className="tabular-nums"
                    >
                      {device.alarmCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {dispositivoTieneHistorialOficial(
                      device.raw.codigo as DispositivoOrigenCodigo | undefined
                    ) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Ver últimas 3 h acumuladas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistorial3h({
                            imei: device.raw.imei,
                            codigo: device.raw.codigo as DispositivoOrigenCodigo,
                            nombre: device.nombreAsignado,
                            zonaHoraria: data?.data?.resumen?.zona_horaria ?? null,
                          });
                        }}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {esSuperUser && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Descargar JSON del equipo"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportEquipoUltimoEstadoJson(
                            device.raw,
                            device.nombreAsignado
                          );
                          if (user?.username) {
                            void postAuditEvent(user.username, {
                              action: AUDIT_ACTIONS.DOWNLOAD_EQUIPO_JSON,
                              module: 'listado',
                              summary: `Descargó JSON del equipo ${device.imei}`,
                              targetId: device.imei,
                              detail: {
                                imei: device.imei,
                                codigo: device.codigo,
                              },
                            });
                          }
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {filteredDevices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('listado.notFound')}
        </div>
      )}

      <Historial3hModal
        open={historial3h != null}
        onOpenChange={(open) => {
          if (!open) setHistorial3h(null);
        }}
        target={historial3h}
      />

      <Dialog
        open={nameEdit != null}
        onOpenChange={(open) => {
          if (!open) setNameEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nombre del equipo</DialogTitle>
            <DialogDescription>
              Equipo {nameEdit?.containerId}
              {nameEdit?.codigo != null && nameEdit.codigo !== '—' && (
                <> · {nameEdit.codigo}</>
              )}
              . Se guarda en el servidor (visible para todos los usuarios) y se registra en el historial de cambios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={nameEdit?.draft ?? ''}
              onChange={(e) =>
                nameEdit &&
                setNameEdit({ ...nameEdit, draft: e.target.value })
              }
              placeholder={SIN_ASIGNAR}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveLocalName();
              }}
            />
            {nameEdit != null && nameEdit.nombreAnterior !== SIN_ASIGNAR && (
              <p className="text-xs text-muted-foreground">
                Nombre actual: <span className="font-medium">{nameEdit.nombreAnterior}</span>
              </p>
            )}
            {nameHistory.length > 0 && (
              <div className="rounded-md border max-h-[180px] overflow-y-auto">
                <div className="px-3 py-2 text-xs font-medium border-b bg-muted/40">
                  Historial de nombres
                </div>
                <ul className="divide-y text-xs">
                  {nameHistory.map((h) => (
                    <li key={h.id} className="px-3 py-2">
                      <div className="text-muted-foreground">
                        {new Date(h.changedAt).toLocaleString('es-ES')}
                        {h.usuario != null && <> · {h.usuario}</>}
                      </div>
                      <div>
                        <span className="line-through text-muted-foreground">{h.nombreAnterior}</span>
                        {' → '}
                        <span className="font-medium">{h.nombreNuevo}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameEdit(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveLocalName}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}
