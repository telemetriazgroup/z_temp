import React, { useState } from 'react';
import type { DispositivoUltimoEstado } from '../types';
import {
  HistorialOficialDetalle,
  type HistorialFocusRango,
} from './HistorialOficialDetalle';
import { AnalisisTelemetriaPanel } from './AnalisisTelemetriaPanel';
import { EquipoEstatusCards } from './EquipoEstatusCards';
import { IffControlPanel } from './IffControlPanel';
import { DeviceAlarmasPanel } from './DeviceAlarmasPanel';
import { ControlCommandLogPanel } from './ControlCommandLogPanel';
import { EquipoReeferDetallePanel } from './EquipoReeferDetallePanel';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';
import { Settings2, Radio, Power, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import {
  formatDateTimeInTz,
  resolveDisplayTimeZone,
} from '../lib/telemetryTimezone';

interface Props {
  dispositivo: DispositivoUltimoEstado;
  tituloPrincipal: string;
  onRefresh: () => void;
  refreshMensaje?: string | null;
  onMapa?: () => void;
  tieneUbicacion?: boolean;
  historialFocus?: HistorialFocusRango | null;
  onVerEventoEnGrafica?: (rango: { since: string; until: string }) => void;
}

export function EquipoDetalleIffLayout({
  dispositivo,
  tituloPrincipal,
  onRefresh,
  refreshMensaje,
  onMapa,
  tieneUbicacion,
  historialFocus = null,
  onVerEventoEnGrafica,
}: Props) {
  const ud = dispositivo.ultimo_dato;
  const powerOn = dispositivo.power_state_texto === 'on';
  const [commandLogKey, setCommandLogKey] = useState(0);

  const handleComandoOk = () => {
    setCommandLogKey((k) => k + 1);
    onRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{tituloPrincipal}</h1>
              <Badge variant="outline" className="font-mono text-xs">
                ID: {dispositivo.imei}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {dispositivo.codigo != null && (
                <Badge variant="outline" className="font-mono">
                  <Radio className="h-3 w-3 mr-1" />
                  {dispositivo.codigo}
                </Badge>
              )}
              <Badge
                className={cn(
                  dispositivo.estado_conexion === 'online' && 'bg-green-600',
                  dispositivo.estado_conexion === 'wait' && 'bg-yellow-600',
                  dispositivo.estado_conexion === 'offline' && 'bg-red-600'
                )}
              >
                {dispositivo.estado_conexion === 'online'
                  ? 'En línea'
                  : dispositivo.estado_conexion.toUpperCase()}
              </Badge>
              <Badge className={powerOn ? 'bg-emerald-600' : 'bg-slate-500'}>
                <Power className="h-3 w-3 mr-1" />
                Equipo {powerOn ? 'ON' : 'OFF'}
              </Badge>
              {dispositivo.en_defrost === true && (
                <Badge variant="secondary">Defrost activo</Badge>
              )}
              {tieneUbicacion && onMapa && (
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onMapa}>
                  <MapPin className="h-4 w-4 mr-1" />
                  Mapa
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Última actualización:{' '}
              {dispositivo.ultima_actualizacion
                ? formatDateTimeInTz(
                    dispositivo.ultima_actualizacion,
                    resolveDisplayTimeZone(dispositivo.zona_horaria).iana
                  )
                : '—'}
              {dispositivo.minutos_desde_ultimo_dato != null && (
                <> · hace {dispositivo.minutos_desde_ultimo_dato} min</>
              )}
            </p>
            {refreshMensaje != null && (
              <p className="text-sm text-muted-foreground italic">{refreshMensaje}</p>
            )}
          </div>
          <div className="flex gap-2 text-sm">
            <span className="inline-flex items-center rounded-lg border px-3 py-2 bg-primary/5 text-primary font-medium">
              Operación
            </span>
            <span className="inline-flex items-center rounded-lg border px-3 py-2 text-muted-foreground">
              Monitoreo y análisis
            </span>
          </div>
        </div>
      </div>

      <EquipoEstatusCards dispositivo={dispositivo} />

      <EquipoReeferDetallePanel key={dispositivo.imei} dispositivo={dispositivo} />

      <DeviceAlarmasPanel ultimoDato={ud} compact />

      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 flex items-start gap-3">
        <Settings2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Módulo control IFF</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comandos vía <code className="text-[10px]">comando_control_tunel</code> con
            registro de la cuenta ejecutora. Alarmas desde{' '}
            <code className="text-[10px]">numero_alarma</code> y{' '}
            <code className="text-[10px]">alarma_01…</code> enlazadas al catálogo MP4000.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-4 space-y-6">
          <IffControlPanel
            dispositivo={dispositivo}
            onComandoOk={handleComandoOk}
          />
          <ControlCommandLogPanel
            imei={dispositivo.imei}
            refreshKey={commandLogKey}
          />
        </div>
        <div className="xl:col-span-8 min-w-0 space-y-6">
          <HistorialOficialDetalle
            imei={dispositivo.imei}
            codigo={dispositivo.codigo!}
            nombreContenedor={tituloPrincipal}
            embedded
            focusRango={historialFocus}
            zonaHoraria={dispositivo.zona_horaria}
          />
          {dispositivo.codigo != null && (
            <AnalisisTelemetriaPanel
              imei={dispositivo.imei}
              codigo={dispositivo.codigo}
              nombreContenedor={tituloPrincipal}
              setPointInicial={dispositivo.ultimo_dato?.set_point ?? null}
              onVerEnGraficaPrincipal={onVerEventoEnGrafica}
            />
          )}
        </div>
      </div>
    </div>
  );
}
