import React, { useEffect, useState } from 'react';
import type { DispositivoUltimoEstado } from '../types';
import { useAuth } from '../AuthContext';
import { userMayControlTemperatura } from '../modules/usuario';
import {
  COMANDO_DEFROST_DATO,
  COMANDO_DEFROST_TIPO,
  COMANDO_STOP_MIN_MINUTOS,
  COMANDO_STOP_MAX_MINUTOS,
  COMANDO_STOP_PLAN_TIPO,
  COMANDO_TEMP_MAX,
  COMANDO_TEMP_MIN,
  buildCambioDefrost,
  buildCambioStopPlan,
  buildCambioTemperatura,
  capturarSnapshotEquipo,
  clampStopPlanMinutos,
  clampTemperaturaComando,
  ejecutarComandoTunel,
  labelComandoDefrost,
  labelComandoStopPlan,
  labelComandoTemperatura,
  minutosStopPlanASegundos,
  temperaturaInicialControl,
  type ControlComandoCambio,
} from '../modules/control';
import { ConfirmarComandoModal } from './ConfirmarComandoModal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from './ui/utils';
import { Loader2, Snowflake, Target, Timer, Zap } from 'lucide-react';

interface Props {
  dispositivo: DispositivoUltimoEstado;
  onComandoOk?: () => void;
}

type Accion = 'temp' | 'defrost' | 'stop';

interface PendienteComando {
  accion: Accion;
  cambios: ControlComandoCambio[];
  ejecutar: () => Promise<void>;
}

export function IffControlPanel({ dispositivo, onComandoOk }: Props) {
  const { user } = useAuth();
  const { imei, codigo = 'TUNEL', ultimo_dato: ud } = dispositivo;
  const setPointActual = ud.set_point;

  const [temperatura, setTemperatura] = useState(() =>
    temperaturaInicialControl(setPointActual)
  );
  const [stopMinutos, setStopMinutos] = useState(COMANDO_STOP_MIN_MINUTOS);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pendiente, setPendiente] = useState<PendienteComando | null>(null);

  useEffect(() => {
    setTemperatura(temperaturaInicialControl(setPointActual));
  }, [setPointActual, imei]);

  const ejecutarComando = async (tipo: Accion, fn: () => Promise<void>) => {
    if (user == null) {
      setMensaje({ tipo: 'err', text: 'Debe iniciar sesión para enviar comandos.' });
      return;
    }
    if (!userMayControlTemperatura(user)) {
      setMensaje({
        tipo: 'err',
        text: 'No tiene permiso de control de temperaturas. Solicite habilitación a un administrador.',
      });
      return;
    }
    setMensaje(null);
    setAccion(tipo);
    try {
      await fn();
      setMensaje({ tipo: 'ok', text: 'Comando enviado correctamente.' });
      setModalAbierto(false);
      setPendiente(null);
      onComandoOk?.();
    } catch (e) {
      setMensaje({
        tipo: 'err',
        text: e instanceof Error ? e.message : 'No se pudo enviar el comando',
      });
    } finally {
      setAccion(null);
    }
  };

  const abrirConfirmacion = (p: PendienteComando) => {
    if (user == null) {
      setMensaje({ tipo: 'err', text: 'Debe iniciar sesión para enviar comandos.' });
      return;
    }
    setPendiente(p);
    setModalAbierto(true);
  };

  const confirmarPendiente = () => {
    if (pendiente == null) return;
    void ejecutarComando(pendiente.accion, pendiente.ejecutar);
  };

  const snapshot = () => capturarSnapshotEquipo(dispositivo);

  const solicitarTemperatura = () => {
    const dato = clampTemperaturaComando(temperatura);
    const snap = snapshot();
    abrirConfirmacion({
      accion: 'temp',
      cambios: [buildCambioTemperatura(snap, dato)],
      ejecutar: async () => {
        if (user == null) return;
        await ejecutarComandoTunel({
          user,
          imei,
          codigo,
          tipo: 1,
          dato,
          label: labelComandoTemperatura(dato),
          estadoAnterior: snap,
          cambios: [buildCambioTemperatura(snap, dato)],
        });
      },
    });
  };

  const solicitarDefrost = () => {
    const snap = snapshot();
    const cambios = [buildCambioDefrost(snap)];
    abrirConfirmacion({
      accion: 'defrost',
      cambios,
      ejecutar: async () => {
        if (user == null) return;
        await ejecutarComandoTunel({
          user,
          imei,
          codigo,
          tipo: COMANDO_DEFROST_TIPO,
          dato: COMANDO_DEFROST_DATO,
          label: labelComandoDefrost(),
          estadoAnterior: snap,
          cambios,
        });
      },
    });
  };

  const solicitarStopPlan = () => {
    const min = clampStopPlanMinutos(stopMinutos);
    const seg = minutosStopPlanASegundos(min);
    const snap = snapshot();
    const cambios = [buildCambioStopPlan(min, seg)];
    abrirConfirmacion({
      accion: 'stop',
      cambios,
      ejecutar: async () => {
        if (user == null) return;
        await ejecutarComandoTunel({
          user,
          imei,
          codigo,
          tipo: COMANDO_STOP_PLAN_TIPO,
          dato: seg,
          label: labelComandoStopPlan(min, seg),
          estadoAnterior: snap,
          cambios,
        });
      },
    });
  };

  return (
    <>
      <Card className="h-full shadow-sm border-primary/10">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Panel de control de temperaturas
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Comandos remotos reefer (setpoint, defrost, stop plan).
            {user != null && (
              <>
                {' '}
                Sesión: <span className="font-medium">{user.username}</span>
              </>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="h-3.5 w-3.5" />
              Climatización
            </h3>
            <div className="space-y-2">
              <Label htmlFor="iff-temp">Temperatura objetivo (°C)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="iff-temp"
                  type="number"
                  min={COMANDO_TEMP_MIN}
                  max={COMANDO_TEMP_MAX}
                  step={1}
                  value={temperatura}
                  onChange={(e) =>
                    setTemperatura(clampTemperaturaComando(Number(e.target.value)))
                  }
                  className="w-24 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">°C</span>
              </div>
              <Slider
                min={COMANDO_TEMP_MIN}
                max={COMANDO_TEMP_MAX}
                step={1}
                value={[temperatura]}
                onValueChange={([v]) => setTemperatura(clampTemperaturaComando(v))}
              />
              <p className="text-xs text-muted-foreground">
                Rango permitido: {COMANDO_TEMP_MIN} a {COMANDO_TEMP_MAX} °C
                {setPointActual != null && !Number.isNaN(setPointActual) && (
                  <> · Actual en equipo: {setPointActual}°C</>
                )}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={solicitarTemperatura}
              disabled={accion != null}
            >
              {accion === 'temp' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Aplicar temperatura
            </Button>
          </section>

          <section className="space-y-3 pt-2 border-t">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              Defrost
            </h3>
            <p className="text-xs text-muted-foreground">
              Ejecuta un ciclo de descongelamiento (comando tipo 8).
            </p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={solicitarDefrost}
              disabled={accion != null}
            >
              {accion === 'defrost' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Snowflake className="h-4 w-4 mr-2" />
              )}
              Aplicar defrost
            </Button>
          </section>

          <section className="space-y-3 pt-2 border-t">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Timer className="h-3.5 w-3.5" />
              Stop plan
            </h3>
            <div className="space-y-2">
              <Label htmlFor="iff-stop">Duración (minutos)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="iff-stop"
                  type="number"
                  min={COMANDO_STOP_MIN_MINUTOS}
                  max={COMANDO_STOP_MAX_MINUTOS}
                  step={1}
                  value={stopMinutos}
                  onChange={(e) =>
                    setStopMinutos(clampStopPlanMinutos(Number(e.target.value)))
                  }
                  className="w-24 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
              <Slider
                min={COMANDO_STOP_MIN_MINUTOS}
                max={COMANDO_STOP_MAX_MINUTOS}
                step={1}
                value={[stopMinutos]}
                onValueChange={([v]) => setStopMinutos(clampStopPlanMinutos(v))}
              />
              <p className="text-xs text-muted-foreground">
                Rango: {COMANDO_STOP_MIN_MINUTOS}–{COMANDO_STOP_MAX_MINUTOS} min (
                {minutosStopPlanASegundos(stopMinutos)} s al enviar)
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={solicitarStopPlan}
              disabled={accion != null}
            >
              {accion === 'stop' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Timer className="h-4 w-4 mr-2" />
              )}
              Aplicar stop plan
            </Button>
          </section>

          {mensaje != null && (
            <p
              className={cn(
                'text-sm rounded-md px-3 py-2',
                mensaje.tipo === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              )}
            >
              {mensaje.text}
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmarComandoModal
        open={modalAbierto}
        onOpenChange={(open) => {
          if (accion != null) return;
          setModalAbierto(open);
          if (!open) setPendiente(null);
        }}
        cambios={pendiente?.cambios ?? []}
        onConfirm={confirmarPendiente}
        confirming={accion != null}
      />
    </>
  );
}
