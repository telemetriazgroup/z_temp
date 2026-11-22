import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import {
  atenderIncidente,
  fetchServerGrupos,
  fetchServerIncidentes,
} from '../modules/correo/correoServerApi';
import {
  incidenteVisibleParaUser,
  rowKeysCorreoActivosForUser,
  userHasCorreoIncidentAccess,
} from '../modules/correo/incidentAccess';
import type { CorreoIncidente } from '../modules/correo/types';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Bell, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const CADA_MS = 10 * 60 * 1000;

function titulo(inc: CorreoIncidente): string {
  if (inc.subject) return inc.subject;
  return inc.alertKind === 'apagado' ? 'Apagado detectado' : 'Fuera de rango detectado';
}

export function RecordatorioIncidentes() {
  const { user } = useAuth();
  const [lista, setLista] = useState<CorreoIncidente[]>([]);
  const [aviso, setAviso] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!user) {
      setLista([]);
      setAviso(false);
      return;
    }
    const grupos = await fetchServerGrupos();
    if (!userHasCorreoIncidentAccess(user, grupos)) {
      setLista([]);
      setAviso(false);
      return;
    }
    const esSuper = user.superUser === true;
    const res = await fetchServerIncidentes({
      todos: esSuper,
      rowKeys: esSuper ? undefined : rowKeysCorreoActivosForUser(user, grupos),
      estado: 'pendiente',
    });
    const visibles = (esSuper ? res.data : res.data.filter((inc) => incidenteVisibleParaUser(user, inc, grupos)))
      .filter((inc) => inc.estado === 'pendiente' && !inc.archivado);
    setLista(visibles);
    if (visibles.length === 0) {
      setAviso(false);
      setAbierto(false);
    }
    return visibles.length;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const mostrar = () => {
      void cargar()
        .then((n) => {
          if (vivo && n && n > 0) setAviso(true);
        })
        .catch(() => {});
    };
    const primero = window.setTimeout(mostrar, 4000);
    const id = window.setInterval(mostrar, CADA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(primero);
      window.clearInterval(id);
    };
  }, [user, cargar]);

  const atender = async (inc: CorreoIncidente) => {
    if (!user) return;
    setOcupado(inc.id);
    try {
      await atenderIncidente(inc.id, user.username);
      const quedan = lista.filter((x) => x.id !== inc.id);
      setLista(quedan);
      if (quedan.length === 0) {
        setAviso(false);
        setAbierto(false);
      }
      toast.success('Incidente marcado como atendido');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo marcar');
    } finally {
      setOcupado(null);
    }
  };

  if (!aviso && !abierto) return null;

  return (
    <>
      {aviso && !abierto && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex flex-1 items-center gap-2 text-left hover:underline"
          >
            <Bell className="h-4 w-4 shrink-0" />
            <span>
              {lista.length === 1
                ? '1 incidente pendiente de revisar.'
                : `${lista.length} incidentes pendientes de revisar.`}{' '}
              El aviso vuelve cada 10 minutos hasta marcarlos atendidos.
            </span>
          </button>
          <button type="button" className="px-2 text-xs" onClick={() => setAviso(false)}>
            Ocultar
          </button>
        </div>
      )}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pendiente de revisar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {lista.slice(0, 20).map((inc) => (
              <div key={inc.id} className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{titulo(inc)}</p>
                <p className="text-muted-foreground">
                  {inc.nombrePlataforma || inc.descripcionEquipo} · IMEI {inc.imei}
                </p>
                {inc.descripcion && <p>{inc.descripcion}</p>}
                <Button
                  size="sm"
                  disabled={ocupado === inc.id}
                  onClick={() => void atender(inc)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Marcar atendido
                </Button>
              </div>
            ))}
            {lista.length > 20 && (
              <p className="text-xs text-muted-foreground">
                Hay {lista.length - 20} más. Al atender estos, el aviso muestra los siguientes.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
