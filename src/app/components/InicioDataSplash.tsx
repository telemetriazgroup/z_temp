import React, { useEffect, useState } from 'react';
import zBear from '../../assets/z-transparent.webp';
import { cn } from './ui/utils';

/** Tiempo entre mensaje 1 y mensaje 2. */
const PHASE1_MS = 1500;
/** Mínimo que permanece el segundo mensaje (si los datos ya llegaron). */
const PHASE2_MIN_MS = 1500;

type Props = {
  /** true mientras aún se espera la carga de datos. */
  waitingForData: boolean;
  className?: string;
};

/**
 * Overlay de carga: logo del oso + mensajes secuenciales.
 * 1) «Vinculando nuevos datos…» (1.5 s)
 * 2) «Integrando datos y analizando…» (mín. 1.5 s y hasta que waitingForData sea false)
 */
export function InicioDataSplash({ waitingForData, className }: Props) {
  const [phase, setPhase] = useState<0 | 1>(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    setPhase(0);
    const t1 = window.setTimeout(() => setPhase(1), PHASE1_MS);
    return () => window.clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== 1) return;
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      if (!waitingForData && elapsed >= PHASE2_MIN_MS) {
        setVisible(false);
        return true;
      }
      return false;
    };
    if (tick()) return;
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id);
    }, 120);
    return () => window.clearInterval(id);
  }, [phase, waitingForData]);

  if (!visible) return null;

  const message =
    phase === 0
      ? 'Vinculando nuevos datos…'
      : 'Integrando datos y analizando…';

  return (
    <div
      className={cn(
        'fixed inset-0 z-30 flex flex-col items-center justify-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px]" />
      <div className="relative z-10 flex flex-col items-center gap-5 px-6">
        <img
          src={zBear}
          alt=""
          className="h-28 w-auto max-h-36 object-contain pointer-events-none select-none animate-pulse"
        />
        <p className="text-center text-lg sm:text-xl font-semibold text-foreground/80 min-h-[1.75rem] transition-opacity duration-300">
          {message}
        </p>
        <div className="flex gap-1.5" aria-hidden>
          <span
            className={cn(
              'h-1.5 w-6 rounded-full transition-colors',
              phase === 0 ? 'bg-sky-600' : 'bg-muted'
            )}
          />
          <span
            className={cn(
              'h-1.5 w-6 rounded-full transition-colors',
              phase === 1 ? 'bg-sky-600' : 'bg-muted'
            )}
          />
        </div>
      </div>
    </div>
  );
}
