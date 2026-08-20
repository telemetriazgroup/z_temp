import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import type { DispositivoUltimoEstado } from '../types';
import { useAuth } from '../AuthContext';
import {
  userMayAccessDispositivo,
  userMayAccessImei,
  userMayAccessDataAt,
  displayNameForDevice,
  userCanManageUsers,
} from '../modules/usuario';
import {
  ensureAlarmCatalog,
  getDeviceAlarmEvents,
  syncDeviceAlarmsFromTelemetry,
  updateDeviceAlarmEvent,
  resolveAlarmDisplayLabel,
  extractActiveAlarmCodes,
  getAlarmCatalogById,
} from '../modules/alarma';
import type { DeviceAlarmEvent } from '../modules/alarma';
import { readDeviceLocalNames } from '../lib/deviceLocalNames';
import { AlarmCatalogDetailPanel } from '../components/AlarmCatalogDetailPanel';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
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
import { Bell, CheckCircle2, AlertCircle, RefreshCw, BookOpen } from 'lucide-react';
import { useT } from '../i18n';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function deviceRowKey(d: DispositivoUltimoEstado): string {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

function formatDate(dateString: string | null): string {
  if (dateString == null) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Alarmas() {
  const t = useT();
  const { user } = useAuth();
  const showTechnical = userCanManageUsers(user);
  const localNames = useMemo(() => readDeviceLocalNames(), []);
  const [events, setEvents] = useState<DeviceAlarmEvent[]>([]);
  const [liveDevices, setLiveDevices] = useState<DispositivoUltimoEstado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      ensureAlarmCatalog();
      const response = await fetchUltimoEstadoDispositivos();
      const visible = response.data.dispositivos.filter((d) =>
        userMayAccessDispositivo(user, d)
      );
      setLiveDevices(visible);
      const synced = syncDeviceAlarmsFromTelemetry(visible);
      const visibleImeis = new Set(visible.map((d) => d.imei));
      setEvents(
        synced.filter(
          (e) =>
            visibleImeis.has(e.imei) &&
            userMayAccessDataAt(user, e.imei, e.detectedAt)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar alarmas');
      setEvents(getDeviceAlarmEvents());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeLive = useMemo(
    () =>
      liveDevices.filter((d) => extractActiveAlarmCodes(d.ultimo_dato).length > 0),
    [liveDevices]
  );

  const totalAlarmas = events.length;
  const alarmasAtendidas = events.filter((a) => a.atendida).length;
  const alarmasPorAtender = events.filter((a) => !a.atendida).length;
  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;
  const selectedCatalog =
    selectedEvent?.catalogId != null
      ? getAlarmCatalogById(selectedEvent.catalogId) ?? null
      : null;

  const handleToggleAtendida = (alarmId: string) => {
    const target = events.find((e) => e.id === alarmId);
    if (!target) return;
    updateDeviceAlarmEvent(alarmId, { atendida: !target.atendida });
    setEvents(
      getDeviceAlarmEvents().filter(
        (e) =>
          userMayAccessImei(user, e.imei) &&
          userMayAccessDataAt(user, e.imei, e.detectedAt)
      )
    );
  };

  const deviceName = (imei: string, codigo: DispositivoUltimoEstado['codigo']) => {
    const rk = codigo != null ? `${codigo}-${imei}` : imei;
    return displayNameForDevice(user, imei, rk, localNames, SIN_ASIGNAR);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('alarmas.title')}</h1>
          <p className="text-gray-500 mt-1">
            Eventos detectados desde telemetría (<code className="text-xs">numero_alarma</code>)
            enlazados al catálogo MP4000.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" asChild>
            <Link to="/catalogo-alarmas">
              <BookOpen className="h-4 w-4 mr-2" />
              Catálogo
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('alarmas.activeNow')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{activeLive.length}</div>
            <p className="text-xs text-gray-500 mt-1">Equipos con alarma en telemetría</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('alarmas.totalRegistered')}</CardTitle>
            <Bell className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlarmas}</div>
            <p className="text-xs text-gray-500 mt-1">Historial local sincronizado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('alarmas.attended')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{alarmasAtendidas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('alarmas.pending')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{alarmasPorAtender}</div>
          </CardContent>
        </Card>
      </div>

      {activeLive.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alarmas activas en equipos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeLive.map((d) => {
              const slots = extractActiveAlarmCodes(d.ultimo_dato);
              return (
                <div
                  key={deviceRowKey(d)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <div className="font-medium">{deviceName(d.imei, d.codigo)}</div>
                    <div className="text-sm text-muted-foreground">
                      IMEI {d.imei} · {d.codigo ?? '—'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {slots.map((s) => (
                      <Badge key={`${s.slot}-${s.code}`} variant="destructive">
                        {showTechnical ? `${s.slot}: ` : ''}
                        {resolveAlarmDisplayLabel(null, s.code, {
                          technical: showTechnical,
                        })}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>{showTechnical ? 'Alarma (técnico)' : 'Mensaje'}</TableHead>
                <TableHead>Detectada</TableHead>
                <TableHead>Cerrada</TableHead>
                <TableHead>Atendida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No hay eventos registrados. Aparecerán cuando un dispositivo reporte{' '}
                    <code>numero_alarma</code> distinto de 0.
                  </TableCell>
                </TableRow>
              )}
              {events.map((alarm) => (
                <TableRow
                  key={alarm.id}
                  className={`cursor-pointer ${alarm.atendida ? 'bg-gray-50' : ''} ${
                    selectedId === alarm.id ? 'ring-1 ring-inset ring-blue-300' : ''
                  }`}
                  onClick={() => setSelectedId(alarm.id)}
                >
                  <TableCell>
                    {alarm.clearedAt == null ? (
                      <Badge variant="destructive">Activa</Badge>
                    ) : alarm.atendida ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{alarm.imei}</TableCell>
                  <TableCell>{deviceName(alarm.imei, alarm.codigo)}</TableCell>
                  <TableCell>{alarm.alarmCode}</TableCell>
                  <TableCell>
                    <span className={alarm.atendida ? 'text-gray-500' : 'font-medium'}>
                      {resolveAlarmDisplayLabel(alarm.catalogId, alarm.alarmCode, {
                        technical: showTechnical,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(alarm.detectedAt)}</TableCell>
                  <TableCell className="text-sm">{formatDate(alarm.clearedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={alarm.atendida}
                      onCheckedChange={() => handleToggleAtendida(alarm.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedEvent && (
        <AlarmCatalogDetailPanel
          catalog={selectedCatalog}
          alarmCode={selectedEvent.alarmCode}
          showTechnical={showTechnical}
        />
      )}
    </div>
  );
}
