import React from 'react';
import type { ControlCommandLogEntry } from '../modules/control/commandLogRepository';
import { resumenSnapshotEquipo } from '../modules/control/commandSnapshot';

interface Props {
  entry: ControlCommandLogEntry;
  compact?: boolean;
}

export function ControlAuditoriaCambioCell({ entry, compact = false }: Props) {
  const cambios = entry.cambios ?? [];

  if (cambios.length > 0) {
    return (
      <div className="space-y-1.5">
        {cambios.map((c) => (
          <div key={c.campo} className="text-xs">
            <span className="text-muted-foreground">{c.label}: </span>
            <span className="line-through text-muted-foreground">{c.valorAnterior}</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span className="font-semibold text-primary">{c.valorNuevo}</span>
          </div>
        ))}
        {!compact && entry.estadoAnterior != null && (
          <p className="text-[10px] text-muted-foreground pt-1 border-t mt-2">
            Antes: {resumenSnapshotEquipo(entry.estadoAnterior)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs">
      {entry.label}
      <span className="text-muted-foreground ml-1 block">
        tipo {entry.tipo}, dato {entry.dato}
      </span>
    </div>
  );
}
