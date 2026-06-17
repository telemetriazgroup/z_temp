import React, { useMemo } from 'react';
import type { DispositivoUltimoEstado } from '../types';
import {
  buildReeferDetalleItems,
  IFF_NO_MADURADOR_NOTA,
} from '../lib/iffReeferTelemetria';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Container } from 'lucide-react';

interface Props {
  dispositivo: DispositivoUltimoEstado;
}

function DatoGrid({ items }: { items: { id: string; label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
      {items.map((item) => (
        <div key={item.id}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm font-medium tabular-nums mt-0.5">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EquipoReeferDetallePanel({ dispositivo }: Props) {
  const { principal, sensores, meta } = useMemo(
    () => buildReeferDetalleItems(dispositivo),
    [dispositivo]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Container className="h-4 w-4 text-primary" />
          Datos del reefer
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">{IFF_NO_MADURADOR_NOTA}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Refrigeración
          </h3>
          <DatoGrid items={principal} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Sensores de carga
          </h3>
          <DatoGrid items={sensores} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Estado y telemetría
          </h3>
          <DatoGrid items={meta} />
        </div>
      </CardContent>
    </Card>
  );
}
