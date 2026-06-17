import React, { useMemo } from 'react';
import type { ReporteCaSeccion31 } from '../lib/reporteCaGases';
import { SECTOR_GASES_META, TOLERANCIA_GAS_CA } from '../lib/reporteCaGases';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Activity } from 'lucide-react';

interface Props {
  seccion: ReporteCaSeccion31;
}

export function ReporteCaSeccion31Panel({ seccion }: Props) {
  const areas = useMemo(() => {
    if (seccion.sectores.length === 0) return [];
    return seccion.sectores.map((s) => ({
      x1: s.desde.getTime(),
      x2: s.hasta.getTime(),
      fill: s.color,
      id: s.id,
    }));
  }, [seccion.sectores]);

  if (seccion.sinDatosGases) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3.1. Lectura inicial de gases y estabilización</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{seccion.resumen}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            3.1. Lectura inicial de gases y estabilización
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">{seccion.resumen}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">Set O₂ objetivo: {seccion.setpointO2 ?? '—'} %</Badge>
            <Badge variant="outline">Set CO₂ objetivo: {seccion.setpointCo2 ?? '—'} %</Badge>
            <Badge variant="secondary">Tolerancia ±{TOLERANCIA_GAS_CA} %</Badge>
            {seccion.duracionEstabilizacionMin != null && (
              <Badge className="bg-emerald-600">
                Estabilización: {seccion.duracionEstabilizacionMin} min
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={seccion.puntos}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                {areas.map((a) => (
                  <ReferenceArea
                    key={a.id}
                    x1={a.x1}
                    x2={a.x2}
                    fill={a.fill}
                    fillOpacity={0.12}
                    ifOverflow="extendDomain"
                  />
                ))}
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(ts) =>
                    new Date(ts as number).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }
                  className="text-xs"
                />
                <YAxis
                  className="text-xs"
                  domain={[0, 'auto']}
                  label={{ value: '%', angle: -90, position: 'insideLeft' }}
                />
                {seccion.setpointO2 != null && (
                  <ReferenceLine
                    y={seccion.setpointO2}
                    stroke="#0ea5e9"
                    strokeDasharray="6 4"
                    label={{
                      value: `Obj. O₂ ${seccion.setpointO2}%`,
                      position: 'insideTopLeft',
                      fill: '#0ea5e9',
                      fontSize: 10,
                    }}
                  />
                )}
                {seccion.setpointCo2 != null && (
                  <ReferenceLine
                    y={seccion.setpointCo2}
                    stroke="#f59e0b"
                    strokeDasharray="6 4"
                    label={{
                      value: `Obj. CO₂ ${seccion.setpointCo2}%`,
                      position: 'insideBottomLeft',
                      fill: '#f59e0b',
                      fontSize: 10,
                    }}
                  />
                )}
                {seccion.estabilizacion != null && (
                  <ReferenceLine
                    x={seccion.estabilizacion.getTime()}
                    stroke="#10b981"
                    strokeWidth={2}
                    label={{
                      value: 'Estabilización',
                      position: 'insideTopRight',
                      fill: '#10b981',
                      fontSize: 10,
                    }}
                  />
                )}
                <Tooltip
                  labelFormatter={(ts) =>
                    new Date(ts as number).toLocaleString('es-ES')
                  }
                  formatter={(value: number | null, name: string) => [
                    value == null ? '—' : `${value} %`,
                    name,
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="o2"
                  name="Oxígeno (O₂)"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="co2"
                  name="CO₂"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
            {Object.values(SECTOR_GASES_META).map((s) => (
              <span key={s.titulo} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: s.color, opacity: 0.7 }}
                />
                {s.titulo}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {seccion.sectores.map((s) => (
          <Card key={s.id} className="border-l-4" style={{ borderLeftColor: s.color }}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{s.titulo}</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                {s.desde.toLocaleString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                →{' '}
                {s.hasta.toLocaleString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {s.duracionMin} min
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                <div>
                  <span className="text-muted-foreground">O₂:</span>{' '}
                  {s.o2Inicio ?? '—'} → {s.o2Fin ?? '—'} %
                </div>
                <div>
                  <span className="text-muted-foreground">CO₂:</span>{' '}
                  {s.co2Inicio ?? '—'} → {s.co2Fin ?? '—'} %
                </div>
              </div>
              <p className="text-sm leading-relaxed">{s.analisis}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
