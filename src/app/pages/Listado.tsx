import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import type {
  UltimoEstadoDispositivosResponse,
  DispositivoUltimoEstado,
  ResumenDispositivos,
} from '../types';
import {
  readDeviceLocalNames,
  persistDeviceLocalNames,
  type DeviceLocalNameMap,
} from '../lib/deviceLocalNames';
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
import {
  userMayAccessImei,
  userHasFullDeviceAccess,
  displayNameForDevice,
  resumenFromDispositivos,
} from '../modules/usuario';
import { cn } from '../components/ui/utils';
import { MapPin, RefreshCw, AlertCircle, Pencil } from 'lucide-react';

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

type StatusFilter = 'ALL' | 'ONLINE' | 'WAIT' | 'OFFLINE';

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

function mapDeviceToDisplay(d: DispositivoUltimoEstado) {
  const status = apiStatusOf(d);
  const power =
    d.power_state_texto != null
      ? (API_POWER_MAP[d.power_state_texto] ?? 'OFF')
      : '—';
  const alarmas = d.ultimo_dato?.numero_alarma ?? 0;
  const lat = d.ultimo_dato?.latitud ?? null;
  const lng = d.ultimo_dato?.longitud ?? null;
  const setPoint = d.ultimo_dato?.set_point ?? null;
  const returnAir = d.ultimo_dato?.return_air ?? null;
  const tempSupply1 = d.ultimo_dato?.temp_supply_1 ?? null;
  const codigo = d.codigo ?? '—';
  const enRango = d.en_rango;
  return {
    rowKey: deviceRowKey(d),
    id: d.imei,
    codigo,
    containerId: d.imei,
    status,
    power,
    ultimaConexion: d.ultima_actualizacion,
    alarmas,
    hasUbicacion: lat != null && lng != null && !(lat === 0 && lng === 0),
    lat: lat ?? 0,
    lng: lng ?? 0,
    setPoint,
    returnAir,
    tempSupply1,
    enRango,
  };
}

function formatTemp(value: number | null): string {
  if (value == null) return '—';
  return String(value);
}

export default function Listado() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [localNames, setLocalNames] = useState<DeviceLocalNameMap>(() =>
    readDeviceLocalNames()
  );
  const [nameEdit, setNameEdit] = useState<{
    rowKey: string;
    containerId: string;
    draft: string;
  } | null>(null);
  const [data, setData] = useState<UltimoEstadoDispositivosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchUltimoEstadoDispositivos();
      setData(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar dispositivos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dispositivos = data?.data?.dispositivos ?? [];
  const resumenApi: ResumenDispositivos | null = data?.data?.resumen ?? null;

  const visibleDispositivos = useMemo(
    () => dispositivos.filter((d) => userMayAccessImei(user, d.imei)),
    [dispositivos, user]
  );

  const resumen = useMemo((): ResumenDispositivos | null => {
    if (resumenApi == null) return null;
    if (userHasFullDeviceAccess(user)) return resumenApi;
    return resumenFromDispositivos(visibleDispositivos, resumenApi.zona_horaria ?? 'GMT-5');
  }, [resumenApi, user, visibleDispositivos]);

  const filteredDevices = visibleDispositivos
    .filter((device) => {
      if (statusFilter !== 'ALL' && apiStatusOf(device) !== statusFilter) {
        return false;
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
      const base = mapDeviceToDisplay(d);
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

  const toggleStatusFilter = (s: Exclude<StatusFilter, 'ALL'>) => {
    setStatusFilter((prev) => (prev === s ? 'ALL' : s));
  };

  const saveLocalName = () => {
    if (nameEdit == null) return;
    const trimmed = nameEdit.draft.trim();
    setLocalNames((prev) => {
      const next = { ...prev };
      if (trimmed === '') delete next[nameEdit.rowKey];
      else next[nameEdit.rowKey] = trimmed;
      persistDeviceLocalNames(next);
      return next;
    });
    setNameEdit(null);
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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="h-10 w-10 animate-spin text-gray-400" />
        <p className="text-gray-500">Cargando listado de dispositivos...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex flex-col items-center gap-4">
          <AlertCircle className="h-12 w-12 text-red-600" />
          <p className="text-red-800 font-medium">Error al cargar los datos</p>
          <p className="text-red-700 text-sm text-center">{error}</p>
          <Button onClick={load} variant="outline">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Listado de Dispositivos</h1>
          <p className="text-gray-500 mt-1">Gestión de equipos registrados</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Actualizar
          </Button>
          <div className="text-right">
            <div className="text-sm text-gray-500">Total de Dispositivos</div>
            <div className="text-3xl font-bold">
              {resumen?.total_dispositivos ?? filteredDevices.length}
            </div>
          </div>
        </div>
      </div>

      {resumen != null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          <SummaryCard
            label="Online"
            value={resumen.online}
            clickable
            selected={statusFilter === 'ONLINE'}
            onClick={() => toggleStatusFilter('ONLINE')}
          />
          <SummaryCard
            label="Wait"
            value={resumen.wait}
            clickable
            selected={statusFilter === 'WAIT'}
            onClick={() => toggleStatusFilter('WAIT')}
          />
          <SummaryCard
            label="Offline"
            value={resumen.offline}
            clickable
            selected={statusFilter === 'OFFLINE'}
            onClick={() => toggleStatusFilter('OFFLINE')}
          />
          <SummaryCard label="Power ON" value={resumen.power_on} />
          <SummaryCard label="Power OFF" value={resumen.power_off} />
          <SummaryCard label="En defrost" value={resumen.en_defrost} />
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Zona horaria</div>
            <div className="text-sm font-medium">{resumen.zona_horaria}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center flex-wrap">
        <Input
          type="text"
          placeholder="Buscar por IMEI, nombre asignado, código (TUNEL, STARCOOL, TERMOKING)..."
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
              onClick={() => setStatusFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Power</TableHead>
                <TableHead>Container ID / IMEI</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Última Conexión</TableHead>
                <TableHead>Set point</TableHead>
                <TableHead>Return air</TableHead>
                <TableHead>Temp. suministro</TableHead>
                <TableHead>En rango</TableHead>
                <TableHead>Alarmas</TableHead>
                <TableHead>Ubicación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow
                  key={device.rowKey}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => goDetalle(device.raw)}
                >
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {device.codigo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(device.status)}>
                      {device.status}
                    </Badge>
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
                  <TableCell
                    className="font-medium hover:text-blue-600"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDeviceClick(device.id);
                    }}
                  >
                    {device.containerId}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate hover:text-blue-600 flex-1',
                          device.nombreAsignado === SIN_ASIGNAR && 'text-muted-foreground'
                        )}
                        title={device.nombreAsignado}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDeviceClick(device.id);
                        }}
                      >
                        {device.nombreAsignado}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Editar nombre"
                        disabled={device.nameLockedByProfile}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNameEdit({
                            rowKey: device.rowKey,
                            containerId: device.containerId,
                            draft: localNames[device.rowKey] ?? '',
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(device.ultimaConexion)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatTemp(device.setPoint)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatTemp(device.returnAir)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatTemp(device.tempSupply1)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      device.enRango === false &&
                        'bg-red-600/15 text-red-900 dark:text-red-100 border-l-4 border-red-600 font-medium'
                    )}
                  >
                    {device.enRango === true && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        NORMAL
                      </Badge>
                    )}
                    {device.enRango === false && (
                      <Badge className="bg-red-600 hover:bg-red-600">FUERA DE RANGO</Badge>
                    )}
                    {device.enRango !== true && device.enRango !== false && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        device.alarmas > 0 ? 'destructive' : 'secondary'
                      }
                    >
                      {device.alarmas}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {device.hasUbicacion ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/ubicanos?lat=${device.lat}&lng=${device.lng}`
                          );
                        }}
                      >
                        <MapPin className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {filteredDevices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No se encontraron dispositivos que coincidan con la búsqueda
        </div>
      )}

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
              Equipo {nameEdit?.containerId}. Se guarda solo en este navegador
              (local). Vacío restaura «{SIN_ASIGNAR}».
            </DialogDescription>
          </DialogHeader>
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
    </div>
  );
}

function SummaryCard({
  label,
  value,
  clickable,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  clickable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors',
        clickable && 'cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {clickable && (
        <div className="text-[10px] text-muted-foreground mt-1">Clic para filtrar</div>
      )}
    </div>
  );
}
