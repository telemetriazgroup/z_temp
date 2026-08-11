import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  LabelList,
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
  serieVisiblePorDefecto,
  seriesConDatos,
  valorSerieFormateado,
  type HistorialChartSerie,
} from '../lib/historialChartConfig';
import {
  formatDateTimeInTz,
  resolveDisplayTimeZone,
} from '../lib/telemetryTimezone';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { ZoomOut } from 'lucide-react';

interface Props {
  data: HistorialChartRow[];
  imei: string;
  nombreContenedor: string;
  rangoLabel?: string | null;
  /** zona_horaria del listado (GMT-4 / GMT-5). */
  zonaHoraria?: string | null;
}

function formatFechaTooltip(ts: number, iana: string): string {
  return formatDateTimeInTz(new Date(ts), iana);
}

function ReeferTooltip({
  active,
  payload,
  label,
  series,
  iana,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | null; color?: string }>;
  label?: number;
  series: HistorialChartSerie[];
  iana: string;
}) {
  if (!active || payload == null || label == null) return null;

  const byKey = new Map(payload.map((p) => [String(p.dataKey), p]));

  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white shadow-xl min-w-[180px]">
      <div className="font-semibold mb-2 border-b border-neutral-700 pb-1">
        {formatFechaTooltip(label, iana)}
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

type BrushRange = { startIndex: number; endIndex: number };

function SparseTempLabel({
  x,
  y,
  value,
  index,
  brush,
  color,
  offsetY = -8,
}: {
  x?: number;
  y?: number;
  value?: number | null;
  index?: number;
  brush: BrushRange;
  color: string;
  offsetY?: number;
}) {
  if (x == null || y == null || index == null) return null;
  if (value == null || Number.isNaN(value)) return null;
  if (index < brush.startIndex || index > brush.endIndex) return null;

  const visibleCount = brush.endIndex - brush.startIndex + 1;
  if (visibleCount > 60) return null;

  const step = Math.max(1, Math.ceil(visibleCount / 10));
  const rel = index - brush.startIndex;
  const isEdge = index === brush.startIndex || index === brush.endIndex;
  if (!isEdge && rel % step !== 0) return null;

  return (
    <text
      x={x}
      y={y + offsetY}
      fill={color}
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      className="pointer-events-none select-none"
    >
      {Number(value).toFixed(1)}
    </text>
  );
}

export function HistorialReeferChart({
  data,
  imei,
  nombreContenedor,
  rangoLabel,
  zonaHoraria,
}: Props) {
  const displayIana = resolveDisplayTimeZone(zonaHoraria).iana;
  const disponibles = useMemo(() => seriesConDatos(data), [data]);
  const tienePct = disponibles.some((s) => s.axis === 'pct');

  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      HISTORIAL_CHART_SERIES.map((s) => [s.key, serieVisiblePorDefecto(s)])
    )
  );

  const [brush, setBrush] = useState<BrushRange>({
    startIndex: 0,
    endIndex: Math.max(0, data.length - 1),
  });

  useEffect(() => {
    setBrush({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
  }, [data]);

  const activas = useMemo(
    () => disponibles.filter((s) => visible[s.key] !== false),
    [disponibles, visible]
  );

  const zoomActivo =
    brush.startIndex > 0 || brush.endIndex < Math.max(0, data.length - 1);

  const rangoMs = useMemo(() => {
    if (data.length < 2) return 0;
    const from = data[brush.startIndex]?.ts ?? data[0].ts;
    const to = data[brush.endIndex]?.ts ?? data[data.length - 1].ts;
    return Math.max(0, to - from);
  }, [data, brush]);

  const tickFormateador = useCallback(
    (ts: number) => {
      if (rangoMs > 48 * 3600000) {
        return formatDateTimeInTz(new Date(ts), displayIana, {
          second: undefined,
          year: '2-digit',
        });
      }
      return formatDateTimeInTz(new Date(ts), displayIana, {
        second: undefined,
        year: undefined,
      });
    },
    [rangoMs, displayIana]
  );

  const toggleSerie = (key: string) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetZoom = () => {
    setBrush({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
  };

  const onBrushChange = (range: { startIndex?: number; endIndex?: number } | null) => {
    if (range?.startIndex == null || range?.endIndex == null) return;
    setBrush({ startIndex: range.startIndex, endIndex: range.endIndex });
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
        <p className="text-[11px] text-muted-foreground">
          Use la barra inferior para zoom · etiquetas de Suministro / Retorno al acercar
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {zoomActivo && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={resetZoom}>
                <ZoomOut className="h-3.5 w-3.5 mr-1.5" />
                Restablecer zoom
              </Button>
            </div>
          )}
          <div className="h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 8, left: 4, bottom: 8 }}>
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
                  allowDataOverflow
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
                  content={<ReeferTooltip series={activas} iana={displayIana} />}
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
                  >
                    {s.showValueLabels === true && (
                      <LabelList
                        dataKey={s.key}
                        content={(props) => (
                          <SparseTempLabel
                            {...props}
                            brush={brush}
                            color={s.color}
                            offsetY={s.key === 'retorno' ? -10 : 14}
                          />
                        )}
                      />
                    )}
                  </Line>
                ))}
                <Brush
                  dataKey="ts"
                  height={32}
                  stroke="#757575"
                  fill="#f5f5f5"
                  travellerWidth={10}
                  startIndex={brush.startIndex}
                  endIndex={brush.endIndex}
                  onChange={onBrushChange}
                  tickFormatter={tickFormateador}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
