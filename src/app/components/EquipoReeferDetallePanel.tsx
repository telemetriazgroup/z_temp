import React, { useMemo, useState } from 'react';
import type { DispositivoUltimoEstado } from '../types';
import {
  buildReeferDetalleItems,
  IFF_NO_MADURADOR_NOTA,
} from '../lib/iffReeferTelemetria';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { cn } from './ui/utils';
import { ChevronDown, Container } from 'lucide-react';

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
  const [abierto, setAbierto] = useState(false);
  const { principal, sensores, meta } = useMemo(
    () => buildReeferDetalleItems(dispositivo),
    [dispositivo]
  );

  return (
    <Collapsible open={abierto} onOpenChange={setAbierto}>
      <Card>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Container className="h-4 w-4 text-primary shrink-0" />
                    Datos del reefer
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-1">
                    {abierto
                      ? IFF_NO_MADURADOR_NOTA
                      : 'Pulse para ver telemetría detallada del equipo.'}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200',
                    abierto && 'rotate-180'
                  )}
                />
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0 border-t">
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
