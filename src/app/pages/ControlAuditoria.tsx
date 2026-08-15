import React, { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import {
  displayNameForDevice,
  userHasFullDeviceAccess,
  userMayAccessImei,
  userCanAccessAudit,
} from '../modules/usuario';
import { getControlCommandLogsForUser, type ControlCommandLogEntry } from '../modules/control';
import { readDeviceLocalNames } from '../lib/deviceLocalNames';
import { ControlAuditoriaCambioCell } from '../components/ControlAuditoriaCambioCell';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { History, Zap } from 'lucide-react';
import { useT } from '../i18n';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deviceLabel(
  entry: ControlCommandLogEntry,
  user: ReturnType<typeof useAuth>['user'],
  localNames: Record<string, string>
): string {
  const rowKey = entry.codigo != null ? `${entry.codigo}-${entry.imei}` : entry.imei;
  return displayNameForDevice(user, entry.imei, rowKey, localNames, SIN_ASIGNAR);
}

export default function ControlAuditoria() {
  const t = useT();
  const { user } = useAuth();
  const localNames = useMemo(() => readDeviceLocalNames(), []);
  const [filtroImei, setFiltroImei] = useState<string>('all');

  if (!userCanAccessAudit(user)) {
    return <Navigate to="/" replace />;
  }

  const logs = useMemo(() => getControlCommandLogsForUser(user, 200), [user]);

  const imeisDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of logs) {
      if (userMayAccessImei(user, e.imei)) set.add(e.imei);
    }
    return Array.from(set).sort();
  }, [logs, user]);

  const logsFiltrados = useMemo(() => {
    if (filtroImei === 'all') return logs;
    return logs.filter((e) => e.imei === filtroImei);
  }, [logs, filtroImei]);

  const soloPropios = user != null && !userHasFullDeviceAccess(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-7 w-7 text-primary" />
          {t('controlAuditoria.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Registro de comandos remotos enviados a contenedores reefer IFF (temperatura, defrost,
          stop plan). Cada entrada guarda la cuenta ejecutora, el cambio (valor anterior → nuevo)
          y la telemetría del equipo antes de aplicar el comando.
        </p>
      </div>

      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Historial de comandos
          </CardTitle>
          {soloPropios && user != null && (
            <p className="text-xs text-muted-foreground font-normal">
              Mostrando comandos de sus equipos asignados y los enviados por{' '}
              <span className="font-medium">{user.username}</span>.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {imeisDisponibles.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Filtrar equipo:</span>
              <Select value={filtroImei} onValueChange={setFiltroImei}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Todos los equipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los equipos</SelectItem>
                  {imeisDisponibles.map((imei) => (
                    <SelectItem key={imei} value={imei}>
                      {displayNameForDevice(user, imei, `TUNEL-${imei}`, localNames, SIN_ASIGNAR)}{' '}
                      ({imei})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {logsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aún no hay comandos registrados.
              {soloPropios && (
                <>
                  {' '}
                  Envíe un comando desde el detalle de un equipo en{' '}
                  <Link to="/listado" className="text-primary underline">
                    Listado
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Cambio</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsFiltrados.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatFecha(e.sentAt)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate" title={e.username}>
                        {e.username}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">
                          {deviceLabel(e, user, localNames)}
                        </div>
                        <div className="text-muted-foreground font-mono">{e.imei}</div>
                        <Button variant="link" className="h-auto p-0 text-xs" asChild>
                          <Link to={`/listado/detalle?imei=${encodeURIComponent(e.imei)}`}>
                            Ver equipo
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px]">
                        <ControlAuditoriaCambioCell entry={e} />
                      </TableCell>
                      <TableCell>
                        {e.success ? (
                          <Badge className="bg-emerald-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive" title={e.error ?? undefined}>
                            Error
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
