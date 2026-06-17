import React from 'react';
import type { ControlComandoCambio } from '../modules/control/commandSnapshot';

interface Props {
  cambio: ControlComandoCambio;
}

export function ControlComandoCambioRow({ cambio }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
      <span className="text-sm font-medium">{cambio.label}</span>
      <div className="flex items-center gap-2 text-sm tabular-nums shrink-0">
        <span className="text-muted-foreground line-through">{cambio.valorAnterior}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold text-primary">{cambio.valorNuevo}</span>
      </div>
    </div>
  );
}
