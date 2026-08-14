import React from 'react';
import type { TempTendencia, TendenciaRango } from '../lib/temperatureUnit';
import {
  tendenciaLabel,
  tendenciaTitle,
  tendenciaRangoLabel,
  tendenciaRangoTitle,
} from '../lib/temperatureUnit';
import { cn } from './ui/utils';

export function TempConTendencia({
  texto,
  tendencia,
  className,
}: {
  texto: string;
  tendencia?: TempTendencia;
  className?: string;
}) {
  if (!tendencia) {
    return <span className={className}>{texto}</span>;
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      title={tendenciaTitle(tendencia)}
    >
      <span>{texto}</span>
      <span
        className={cn(
          'font-semibold text-[11px]',
          tendencia === 'up' && 'text-red-600',
          tendencia === 'down' && 'text-blue-600',
          tendencia === 'flat' && 'text-muted-foreground'
        )}
        aria-label={tendenciaTitle(tendencia)}
      >
        {tendenciaLabel(tendencia)}
      </span>
    </span>
  );
}

/** Flecha verde ↑ si vuelve al rango; ↓ si sale de rango. */
export function TempConTendenciaRango({
  texto,
  tendencia,
  className,
  textoClassName,
}: {
  texto: string;
  tendencia?: TendenciaRango;
  className?: string;
  textoClassName?: string;
}) {
  if (!tendencia || tendencia === 'flat') {
    return <span className={cn(textoClassName, className)}>{texto}</span>;
  }
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      title={tendenciaRangoTitle(tendencia)}
    >
      <span className={textoClassName}>{texto}</span>
      <span
        className={cn(
          'font-bold text-sm leading-none',
          tendencia === 'toward' && 'text-emerald-600',
          tendencia === 'away' && 'text-red-600'
        )}
        aria-label={tendenciaRangoTitle(tendencia)}
      >
        {tendenciaRangoLabel(tendencia)}
      </span>
    </span>
  );
}
