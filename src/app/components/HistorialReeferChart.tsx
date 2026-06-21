import React, { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistorialChartRow } from '../lib/historialOficial';
import {
  HISTORIAL_CHART_SERIES,
  seriesConDatos,
  valorSerieFormateado,
  type HistorialChartSerie,
} from '../lib/historialChartConfig';
import { cn } from './ui/utils';

interface Props {
  data: HistorialChartRow[];
  imei: string;
  nombreContenedor: string;
  rangoLabel?: string | null;
}

function formatFechaTooltip(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ReeferTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | null; color?: string }>;
  label?: number;
  series: HistorialChartSerie[];
}) {
  if (!active || payload == null || label == null) return null;

  const byKey = new Map(payload.map((p) => [String(p.dataKey), p]));

  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white shadow-xl min-w-[180px]">
      <div className="font-semibold mb-2 border-b border-neutral-700 pb-1">
        {formatFechaTooltip(label)}
      </div>
      <div className="space-y-1">
        {series.map((s) => {
          const item = byKey.get(s.key);
          if (item == null) return null;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1">{s.label}</span>
              <span className="font-mono tabular-nums">
                {valorSerieFormateado(item.value, s.unit)}
                {s.unit === '°C' ? '' : ` ${s.unit}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HistorialReeferChart({ data, imei, nombreContenedor, rangoLabel }: Props) {
  const disponibles = useMemo(() => seriesConDatos(data), [data]);
  const tienePct = disponibles.some((s) => s.axis === 'pct');

  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(HISTORIAL_CHART_SERIES.map((s) => [s.key, true]))
  );

  const activas = useMemo(
    () => disponibles.filter((s) => visible[s.key] !== false),
    [disponibles, visible]
  );

  const rangoMs = useMemo(() => {
    if (data.length < 2) return 0;
    const ts = data.map((r) => r.ts);
    return Math.max(...ts) - Math.min(...ts);
  }, [data]);

  const tickFormateador = useCallback(
    (ts: number) => {
      const d = new Date(ts);
      if (rangoMs > 48 * 3600000) {
        return d.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [rangoMs]
  );

  const toggleSerie = (key: string) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay puntos para graficar en el rango seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold leading-snug">
          Reefer Monitoring Data {imei}({nombreContenedor})
        </h3>
        {rangoLabel != null && rangoLabel !== '' && (
          <p className="text-xs text-muted-foreground">Search by Date: {rangoLabel}</p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-w-0 h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 48 }}>
              <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tickFormateador}
                angle={-35}
                textAnchor="end"
                height={56}
                tick={{ fontSize: 10, fill: '#616161' }}
              />
              <YAxis
                yAxisId="temp"
                tick={{ fontSize: 10, fill: '#616161' }}
                label={{
                  value: 'Temperature (C°)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: '#424242' },
                }}
              />
              {tienePct && (
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#616161' }}
                  label={{
                    value: 'Percentage (%)',
                    angle: 90,
                    position: 'insideRight',
                    style: { fontSize: 11, fill: '#424242' },
                  }}
                />
              )}
              <Tooltip
                content={
                  <ReeferTooltip series={activas} />
                }
              />
              {activas.map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.axis === 'pct' ? 'pct' : 'temp'}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={s.strokeWidth ?? 1.75}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <aside className="lg:w-[148px] shrink-0 rounded-md border bg-muted/20 px-2 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
            Leyenda
          </p>
          <div className="flex flex-col gap-1">
            {disponibles.map((s) => {
              const on = visible[s.key] !== false;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSerie(s.key)}
                  className={cn(
                    'flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-opacity hover:bg-muted/60',
                    !on && 'opacity-45'
                  )}
                  title={on ? 'Ocultar serie' : 'Mostrar serie'}
                >
                  <span
                    className="inline-block h-3 w-4 shrink-0 rounded-sm border border-black/10"
                    style={{ backgroundColor: on ? s.color : '#bdbdbd' }}
                  />
                  <span className="leading-tight">{s.label}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
