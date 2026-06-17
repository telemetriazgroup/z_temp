import React, { useMemo } from 'react';
import { getControlCommandLogsByImei } from '../modules/control/commandLogRepository';
import { ControlAuditoriaCambioCell } from './ControlAuditoriaCambioCell';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { History } from 'lucide-react';

interface Props {
  imei: string;
  limit?: number;
  /** Incrementar tras enviar un comando para refrescar la lista. */
  refreshKey?: number;
}

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

export function ControlCommandLogPanel({ imei, limit = 10, refreshKey = 0 }: Props) {
  const logs = useMemo(
    () => getControlCommandLogsByImei(imei, limit),
    [imei, limit, refreshKey]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Historial de comandos
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Auditoría local: cuenta, cambio aplicado y estado del equipo antes del comando.
        </p>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aún no hay comandos registrados para este equipo.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Cambio</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatFecha(e.sentAt)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate" title={e.username}>
                      {e.username}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
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
  );
}
