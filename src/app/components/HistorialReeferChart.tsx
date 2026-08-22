import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { HistorialChartRowDyn, HistorialChartSerieDyn } from '../modules/historialVista';
import { seriesConDatosDyn } from '../modules/historialVista';
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
import {
  formatDateTimeInTz,
  resolveDisplayTimeZone,
} from '../lib/telemetryTimezone';
import type { TemperaturaUnidad } from '../lib/temperatureUnit';
import { unidadSimbolo } from '../lib/temperatureUnit';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { cn } from './ui/utils';
import { ZoomOut } from 'lucide-react';

interface Props {
  data: HistorialChartRowDyn[];
  series: HistorialChartSerieDyn[];
  imei: string;
  nombreContenedor: string;
  rangoLabel?: string | null;
  zonaHoraria?: string | null;
  compact?: boolean;
  /** Unidad de display para eje Y1 (ya convertida en data si F). */
  tempUnidad?: TemperaturaUnidad;
}

function formatFechaTooltip(ts: number, iana: string): string {
  return formatDateTimeInTz(new Date(ts), iana);
}

function valorSerieFormateado(value: unknown, unit: string): string {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  if (unit === '°C' || unit === '°F') return n.toFixed(1);
  if (unit === '%' || unit === 'A' || unit === 'V') return n.toFixed(1);
  return n.toFixed(unit === 'ppm' ? 0 : 1);
}

function labelText(value: number, unit: string): string {
  const n = valorSerieFormateado(value, unit);
  if (unit === '°C' || unit === '°F') return `${n} ${unit}`;
  if (!unit) return n;
  return `${n} ${unit}`;
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
  series: HistorialChartSerieDyn[];
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
                {s.unit === '°C' || s.unit === '°F' ? '' : ` ${s.unit}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type BrushRange = { startIndex: number; endIndex: number };

/** Etiquetas espaciadas: ~6–8 en el zoom visible, nunca todas las muestras. */
function SparseValueLabel({
  x,
  y,
  value,
  index,
  brush,
  color,
  unit,
  offsetY = -12,
  maxLabels = 7,
}: {
  x?: number;
  y?: number;
  value?: number | null;
  index?: number;
  brush: BrushRange;
  color: string;
  unit: string;
  offsetY?: number;
  maxLabels?: number;
}) {
  if (x == null || y == null || index == null) return null;
  if (value == null || Number.isNaN(value)) return null;
  if (index < brush.startIndex || index > brush.endIndex) return null;

  const visibleCount = brush.endIndex - brush.startIndex + 1;
  const target = Math.min(maxLabels, Math.max(3, Math.ceil(visibleCount / 12)));
  const step = Math.max(1, Math.ceil(visibleCount / target));
  const rel = index - brush.startIndex;
  const isEdge = index === brush.startIndex || index === brush.endIndex;
  const isStep = rel % step === 0;
  if (!isEdge && !isStep) return null;
  // Evitar etiqueta pegada al borde si el step cae cerca del final
  if (!isEdge && rel + step > visibleCount - 1 && rel !== 0) return null;

  return (
    <text
      x={x}
      y={y + offsetY}
      fill={color}
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      className="pointer-events-none"
      stroke="#fff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {labelText(Number(value), unit)}
    </text>
  );
}

function yAxisIdOf(axis: HistorialChartSerieDyn['axis']): string {
  if (axis === 'pct') return 'pct';
  if (axis === 'high') return 'high';
  return 'temp';
}

function labelOffsetForRank(rank: number): number {
  // Alterna arriba/abajo y separa verticalmente series con etiquetas.
  const base = rank % 2 === 0 ? -14 : 18;
  const extra = Math.floor(rank / 2) * 14;
  return rank % 2 === 0 ? base - extra : base + extra;
}

export function HistorialReeferChart({
  data,
  series,
  imei,
  nombreContenedor,
  rangoLabel,
  zonaHoraria,
  compact = false,
  tempUnidad = 'C',
}: Props) {
  const displayIana = resolveDisplayTimeZone(zonaHoraria).iana;
  const disponibles = useMemo(
    () => seriesConDatosDyn(data, series),
    [data, series]
  );

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [labelsOn, setLabelsOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setEnabled((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of series) {
        next[s.key] = prev[s.key] ?? s.defaultVisible !== false;
      }
      return next;
    });
    setLabelsOn(() => {
      const next: Record<string, boolean> = {};
      for (const s of series) {
        next[s.key] = s.showValueLabels === true;
      }
      return next;
    });
  }, [series]);

  const activas = useMemo(
    () => disponibles.filter((s) => enabled[s.key] !== false),
    [disponibles, enabled]
  );

  const labeledActivas = useMemo(
    () => activas.filter((s) => labelsOn[s.key] === true),
    [activas, labelsOn]
  );

  const labelRank = useMemo(() => {
    const m = new Map<string, number>();
    labeledActivas.forEach((s, i) => m.set(s.key, i));
    return m;
  }, [labeledActivas]);

  const tienePct = activas.some((s) => s.axis === 'pct');
  const tieneHigh = activas.some((s) => s.axis === 'high');

  const [brush, setBrush] = useState<BrushRange>({
    startIndex: 0,
    endIndex: Math.max(0, data.length - 1),
  });

  useEffect(() => {
    setBrush({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
  }, [data.length, imei]);

  const onBrushChange = useCallback((range: unknown) => {
    const r = range as { startIndex?: number; endIndex?: number } | null;
    if (r?.startIndex == null || r?.endIndex == null) return;
    setBrush({ startIndex: r.startIndex, endIndex: r.endIndex });
  }, []);

  const tickFormateador = useCallback(
    (ts: number) => formatDateTimeInTz(new Date(ts), displayIana, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    [displayIana]
  );

  const tempLabel = `Temperature (${unidadSimbolo(tempUnidad)})`;
  const chartH = compact ? 280 : 420;
  const maxLabels = compact ? 5 : 7;

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sin puntos para graficar en el rango.
      </p>
    );
  }

  return (
    <div className={cn('w-full', compact ? 'space-y-2' : 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {nombreContenedor}
          {rangoLabel ? ` · ${rangoLabel}` : ''}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setBrush({ startIndex: 0, endIndex: Math.max(0, data.length - 1) })
          }
        >
          <ZoomOut className="h-3.5 w-3.5 mr-1" />
          Reset zoom
        </Button>
      </div>

      <div
        className={cn(
          'flex flex-col gap-3',
          !compact && 'lg:flex-row lg:items-stretch'
        )}
      >
        <div className="min-w-0 flex-1 rounded-md border bg-card p-2">
          <div style={{ width: '100%', height: chartH }}>
            <ResponsiveContainer>
              <LineChart
                data={data}
                margin={{
                  top: labeledActivas.length ? 22 : 8,
                  right: tieneHigh ? 56 : tienePct ? 48 : 12,
                  left: 4,
                  bottom: 8,
                }}
              >
                <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={tickFormateador}
                  angle={-35}
                  textAnchor="end"
                  height={compact ? 44 : 56}
                  tick={{ fontSize: 10, fill: '#616161' }}
                  allowDataOverflow
                />
                <YAxis
                  yAxisId="temp"
                  tick={{ fontSize: 10, fill: '#616161' }}
                  width={compact ? 40 : 60}
                  label={
                    compact
                      ? undefined
                      : {
                          value: tempLabel,
                          angle: -90,
                          position: 'insideLeft',
                          style: { fontSize: 11, fill: '#424242' },
                        }
                  }
                />
                {tienePct && (
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#616161' }}
                    width={compact ? 36 : 48}
                    label={
                      compact
                        ? undefined
                        : {
                            value: '%',
                            angle: 90,
                            position: 'insideRight',
                            style: { fontSize: 11, fill: '#424242' },
                          }
                    }
                  />
                )}
                {tieneHigh && (
                  <YAxis
                    yAxisId="high"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#616161' }}
                    width={compact ? 36 : 48}
                    dx={tienePct ? 42 : 0}
                    label={
                      compact
                        ? undefined
                        : {
                            value: 'ppm',
                            angle: 90,
                            position: 'insideRight',
                            style: { fontSize: 11, fill: '#424242' },
                          }
                    }
                  />
                )}
                <Tooltip
                  content={<ReeferTooltip series={activas} iana={displayIana} />}
                />
                {activas.map((s) => (
                  <Line
                    key={s.key}
                    yAxisId={yAxisIdOf(s.axis)}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 1.75}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  >
                    {labelsOn[s.key] === true && (
                      <LabelList
                        dataKey={s.key}
                        content={(props) => (
                          <SparseValueLabel
                            {...props}
                            brush={brush}
                            color={s.color}
                            unit={s.unit}
                            offsetY={labelOffsetForRank(labelRank.get(s.key) ?? 0)}
                            maxLabels={maxLabels}
                          />
                        )}
                      />
                    )}
                  </Line>
                ))}
                <Brush
                  dataKey="ts"
                  height={compact ? 24 : 32}
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

        <aside
          className={cn(
            'shrink-0 rounded-md border bg-muted/20 px-2 py-3',
            compact
              ? 'w-full flex flex-wrap gap-1 content-start max-h-none'
              : 'lg:w-[168px]'
          )}
        >
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1 w-full">
            Series
          </p>
          {!compact && (
            <div className="flex items-center justify-between gap-1 px-1 mb-1 w-full text-[10px] text-muted-foreground">
              <span>Visible</span>
              <span>Valores</span>
            </div>
          )}
          {disponibles.map((s) => {
            const on = enabled[s.key] !== false;
            const lab = labelsOn[s.key] === true;
            return (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-1.5 w-full rounded px-1 py-1 text-xs',
                  on ? 'opacity-100' : 'opacity-40'
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                  onClick={() =>
                    setEnabled((prev) => ({ ...prev, [s.key]: !on }))
                  }
                  title={on ? 'Ocultar serie' : 'Mostrar serie'}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate">{s.label}</span>
                </button>
                {!compact && (
                  <Checkbox
                    checked={lab}
                    disabled={!on}
                    onCheckedChange={(v) =>
                      setLabelsOn((prev) => ({
                        ...prev,
                        [s.key]: v === true,
                      }))
                    }
                    aria-label={`Etiquetas de ${s.label}`}
                    title="Mostrar etiquetas de valor"
                  />
                )}
              </div>
            );
          })}
          {disponibles.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">Sin series con datos</p>
          )}
        </aside>
      </div>
    </div>
  );
}
