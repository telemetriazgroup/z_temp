import React from 'react';
import type { ControlComandoCambio } from '../modules/control/commandSnapshot';
import { ControlComandoCambioRow } from './ControlComandoCambioRow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cambios: ControlComandoCambio[];
  onConfirm: () => void;
  confirming?: boolean;
}

export function ConfirmarComandoModal({
  open,
  onOpenChange,
  cambios,
  onConfirm,
  confirming = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Cambios</DialogTitle>
          <DialogDescription>
            Se aplicarán los siguientes cambios en el dispositivo:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {cambios.map((c) => (
            <ControlComandoCambioRow key={c.campo} cambio={c} />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={confirming}>
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              'Confirmar Cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
