import React, { useMemo } from 'react';
import type { UltimoDatoDispositivo } from '../types';
import { resolveAlarmSlotsFromUltimoDato } from '../modules/alarma/alarmSlots';
import { AlarmCatalogDetailPanel } from './AlarmCatalogDetailPanel';
import { useAuth } from '../AuthContext';
import { userCanManageUsers } from '../modules/usuario';
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
import { Bell, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  ultimoDato: UltimoDatoDispositivo;
  compact?: boolean;
}

export function DeviceAlarmasPanel({ ultimoDato, compact = false }: Props) {
  const { user } = useAuth();
  const showTechnical = userCanManageUsers(user);
  const alarmas = useMemo(
    () => resolveAlarmSlotsFromUltimoDato(ultimoDato),
    [ultimoDato]
  );

  const primeraConCatalogo = alarmas.find((a) => a.catalog != null)?.catalog ?? null;
  const primeraCode = alarmas[0]?.code ?? null;

  if (alarmas.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 flex items-center gap-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          Sin alarmas activas en el equipo
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-red-600" />
            Alarmas activas del equipo
          </CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            {showTechnical
              ? 'Códigos de telemetría relacionados con el catálogo MP4000.'
              : 'Mensaje resumido de cada alarma activa.'}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {showTechnical && <TableHead>Campo</TableHead>}
                <TableHead>Código</TableHead>
                <TableHead>{showTechnical ? 'Significado' : 'Mensaje'}</TableHead>
                {showTechnical && <TableHead>Catálogo</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {alarmas.map((a) => (
                <TableRow key={`${a.slot}-${a.code}`}>
                  {showTechnical && (
                    <TableCell className="font-mono text-xs">{a.slot}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="destructive">{a.code}</Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-md">
                    {showTechnical ? a.titleEs : a.mensajeUsuario}
                  </TableCell>
                  {showTechnical && (
                    <TableCell>
                      {a.enCatalogo ? (
                        <Badge
                          variant="outline"
                          className="text-emerald-700 border-emerald-300"
                        >
                          En catálogo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Sin ficha
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!compact && primeraCode != null && (
        <AlarmCatalogDetailPanel
          catalog={primeraConCatalogo}
          alarmCode={primeraCode}
          showTechnical={showTechnical}
        />
      )}
    </div>
  );
}
