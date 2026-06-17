import React from 'react';
import type { DispositivoUltimoEstado } from '../types';
import {
  buildReeferEstatusCards,
  IFF_NO_MADURADOR_NOTA,
} from '../lib/iffReeferTelemetria';
import { cn } from './ui/utils';
import {
  Thermometer,
  Wind,
  Bell,
  Snowflake,
  Droplets,
  Percent,
  Activity,
  Target,
  Zap,
  Flame,
  CheckCircle2,
} from 'lucide-react';

const ICON_BY_ID: Record<string, React.ComponentType<{ className?: string }>> = {
  set_point: Target,
  temp_supply_1: Thermometer,
  return_air: Wind,
  evaporation_coil: Snowflake,
  condensation_coil: Droplets,
  compress_coil_1: Flame,
  capacity_load: Percent,
  power_kwh: Zap,
  alarmas: Bell,
  en_rango: CheckCircle2,
  defrost: Snowflake,
  power: Activity,
};

const ACCENT_BY_ID: Record<string, string> = {
  set_point: 'text-violet-600 bg-violet-50',
  temp_supply_1: 'text-sky-600 bg-sky-50',
  return_air: 'text-cyan-600 bg-cyan-50',
  evaporation_coil: 'text-indigo-600 bg-indigo-50',
  condensation_coil: 'text-slate-600 bg-slate-50',
  compress_coil_1: 'text-orange-600 bg-orange-50',
  capacity_load: 'text-amber-600 bg-amber-50',
  power_kwh: 'text-yellow-700 bg-yellow-50',
  alarmas: 'text-red-600 bg-red-50',
  en_rango: 'text-emerald-600 bg-emerald-50',
  defrost: 'text-blue-600 bg-blue-50',
  power: 'text-emerald-700 bg-emerald-50',
};

interface Props {
  dispositivo: DispositivoUltimoEstado;
}

export function EquipoEstatusCards({ dispositivo }: Props) {
  const cards = buildReeferEstatusCards(dispositivo);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estatus reefer
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{IFF_NO_MADURADOR_NOTA}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
        {cards.map((c) => {
          const Icon = ICON_BY_ID[c.id] ?? Activity;
          const accent = ACCENT_BY_ID[c.id] ?? 'text-slate-600 bg-slate-50';
          const alarmasActivas = c.id === 'alarmas' && c.value !== '0';

          return (
            <div
              key={c.id}
              className="rounded-xl border bg-card p-3 shadow-sm flex flex-col gap-2 min-h-[88px]"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-lg',
                    accent
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="leading-tight">{c.label}</span>
              </div>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  alarmasActivas && 'text-red-600'
                )}
              >
                {c.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
