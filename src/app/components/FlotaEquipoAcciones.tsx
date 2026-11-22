import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

type Control = {
  activo: boolean;
  alerta30Minutos: boolean;
  alerta1Hora: boolean;
  rangoMin: number;
  rangoMax: number;
};

type Nota = {
  id: string;
  texto: string;
  username: string | null;
  creadoEn: string;
  fotos: string[];
};

type Incidente = {
  id: string;
  tipo: string;
  tipoLabel: string;
  descripcion: string;
  estado: string;
  solucion: string | null;
  creadoEn: string;
  cerradoEn: string | null;
  notas: Nota[];
  fotos: string[];
};

type Tipo = { id: string; label: string };

type Equipo = {
  rowKey: string;
  imei: string;
  codigo: string;
  nombreAsignado: string;
};

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem('ztrack_user');
    if (!raw) return h;
    const user = JSON.parse(raw) as { username?: string; superUser?: boolean; category?: string };
    if (user.username?.trim()) h['X-ZTrack-User'] = user.username.trim();
    if (user.superUser === true || user.category === 'superadmin') h['X-ZTrack-Super-User'] = 'true';
  } catch {
    /* sin sesión */
  }
  return h;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/whatsapp${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

function fotoUrl(id: string) {
  return `${BASE}/whatsapp/incidentes/foto/${id}`;
}

function hora(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function leerFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No pude leer la foto'));
    };
    img.src = url;
  });
}

export function FlotaEquipoAcciones({ device }: { device: Equipo }) {
  const [controlOpen, setControlOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title="Alertas de WhatsApp de este equipo"
        onClick={(e) => {
          e.stopPropagation();
          setControlOpen(true);
        }}
      >
        <Bell className="h-4 w-4" />
      </Button>
      {controlOpen && (
        <ControlModal device={device} onClose={() => setControlOpen(false)} />
      )}
    </>
  );
}

function ControlModal({ device, onClose }: { device: Equipo; onClose: () => void }) {
  const [control, setControl] = useState<Control>({
    activo: false,
    alerta30Minutos: false,
    alerta1Hora: false,
    rangoMin: 4,
    rangoMax: 4,
  });
  const [listo, setListo] = useState(false);

  React.useEffect(() => {
    api<{ data: Record<string, Control> }>('/control-flota')
      .then((body) => {
        const actual = body.data?.[device.rowKey];
        if (actual) setControl(actual);
        setListo(true);
      })
      .catch((e) => toast.error(e.message));
  }, [device.rowKey]);

  async function guardar() {
    try {
      const body = await api<{ data: Control }>('/control-flota', {
        method: 'PUT',
        body: JSON.stringify({
          rowKey: device.rowKey,
          imei: device.imei,
          ...control,
        }),
      });
      setControl(body.data);
      toast.success('Aviso de WhatsApp guardado. El correo no cambia.');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>WhatsApp · {device.nombreAsignado}</DialogTitle>
          <DialogDescription>
            El rango mínimo y el máximo definen lo normal para este aviso. 4 y 4 es la banda del sistema.
            El correo no cambia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Alertas de WhatsApp de este equipo
            <Switch
              checked={control.activo}
              disabled={!listo}
              onCheckedChange={(v) => setControl((c) => ({ ...c, activo: v === true }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm space-y-1">
              Rango mínimo (°C bajo el set)
              <Input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={control.rangoMin}
                onChange={(e) => setControl((c) => ({ ...c, rangoMin: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm space-y-1">
              Rango máximo (°C sobre el set)
              <Input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={control.rangoMax}
                onChange={(e) => setControl((c) => ({ ...c, rangoMax: Number(e.target.value) }))}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Con set −20, mínimo 4 y máximo 2, lo normal va de −24 a −18 °C.
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            Avisar a los 30 minutos
            <Switch
              checked={control.alerta30Minutos}
              disabled={!control.activo}
              onCheckedChange={(v) => setControl((c) => ({ ...c, alerta30Minutos: v === true }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Avisar a la 1 hora
            <Switch
              checked={control.alerta1Hora}
              disabled={!control.activo}
              onCheckedChange={(v) => setControl((c) => ({ ...c, alerta1Hora: v === true }))}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            El número de esta cuenta tiene que estar vinculado y con la prueba aprobada. Si marcas los dos
            tiempos, llega el de 30 minutos y después el de 1 hora.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar()} disabled={!listo}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IncidentePanel({ device }: { device: Equipo }) {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [lista, setLista] = useState<Incidente[]>([]);
  const [tipo, setTipo] = useState('sin_conexion');
  const [descripcion, setDescripcion] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [cierre, setCierre] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  async function cargar() {
    const body = await api<{ tipos: Tipo[]; data: Incidente[] }>(
      `/incidentes?rowKey=${encodeURIComponent(device.rowKey)}&imei=${encodeURIComponent(device.imei)}`
    );
    setTipos(body.tipos);
    setLista(body.data);
    if (body.tipos[0] && !body.tipos.some((t) => t.id === tipo)) setTipo(body.tipos[0].id);
  }

  React.useEffect(() => {
    cargar().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.rowKey]);

  async function elegirFotos(files: FileList | null) {
    if (!files?.length) return;
    try {
      const siguientes = [...fotos];
      for (const file of Array.from(files).slice(0, 6 - siguientes.length)) {
        siguientes.push(await leerFoto(file));
      }
      setFotos(siguientes.slice(0, 6));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude leer la foto');
    }
  }

  async function crear() {
    try {
      await api('/incidentes', {
        method: 'POST',
        body: JSON.stringify({
          rowKey: device.rowKey,
          imei: device.imei,
          codigo: device.codigo,
          nombre: device.nombreAsignado,
          tipo,
          descripcion,
          fotos,
        }),
      });
      setDescripcion('');
      setFotos([]);
      toast.success('Incidente en seguimiento. Llegará el recordatorio por WhatsApp.');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir');
    }
  }

  async function anotar(id: string) {
    try {
      await api(`/incidentes/${id}/nota`, {
        method: 'POST',
        body: JSON.stringify({ texto: nota, fotos }),
      });
      setNota('');
      setFotos([]);
      toast.success('Seguimiento anotado');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anotar');
    }
  }

  async function cerrar(id: string) {
    try {
      await api(`/incidentes/${id}/cerrar`, {
        method: 'POST',
        body: JSON.stringify({ solucion: cierre }),
      });
      setCierre('');
      toast.success('Incidente cerrado');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar');
    }
  }

  const seleccionado = lista.find((i) => i.id === abierto) ?? null;

  return (
    <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Incidentes · {device.nombreAsignado}</h2>
          <p className="text-sm text-muted-foreground">
            Aquí quedan los casos abiertos y cerrados de este equipo. Cada 6 horas WhatsApp recuerda
            anotar el seguimiento o cerrarlo.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            Tipo
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            Descripción de la falla
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border bg-background p-2"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            Fotos
            <input
              type="file"
              accept="image/*"
              multiple
              className="mt-1 block w-full text-xs"
              onChange={(e) => elegirFotos(e.target.files)}
            />
          </label>
          {fotos.length > 0 && (
            <p className="text-xs text-muted-foreground">{fotos.length} foto(s) lista(s), máximo 6.</p>
          )}
          <Button onClick={() => crear()}>Abrir en seguimiento</Button>
        </div>

        <div className="space-y-3 border-t pt-3">
          {lista.length === 0 && <p className="text-sm text-muted-foreground">Sin incidentes de este equipo.</p>}
          {lista.map((inc) => (
            <button
              key={inc.id}
              type="button"
              className="block w-full rounded border p-2 text-left text-sm"
              onClick={() => setAbierto(inc.id === abierto ? null : inc.id)}
            >
              <span className="font-medium">{inc.tipoLabel}</span>
              <span className="ml-2 text-xs uppercase text-muted-foreground">{inc.estado}</span>
              <div className="text-xs text-muted-foreground">{hora(inc.creadoEn)}</div>
              <div>{inc.descripcion}</div>
            </button>
          ))}
        </div>

        {seleccionado && (
          <div className="space-y-3 rounded border p-3 text-sm">
            <div className="font-medium">Línea de tiempo</div>
            <div className="border-l pl-3 space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">{hora(seleccionado.creadoEn)} · alta</div>
                <div>{seleccionado.descripcion}</div>
                <Fotos ids={seleccionado.fotos} />
              </div>
              {seleccionado.notas.map((n) => (
                <div key={n.id}>
                  <div className="text-xs text-muted-foreground">{hora(n.creadoEn)} · seguimiento</div>
                  <div>{n.texto}</div>
                  <Fotos ids={n.fotos} />
                </div>
              ))}
              {seleccionado.estado === 'cerrado' && (
                <div>
                  <div className="text-xs text-muted-foreground">{hora(seleccionado.cerradoEn)} · cierre</div>
                  <div>{seleccionado.solucion}</div>
                </div>
              )}
            </div>
            {seleccionado.estado === 'seguimiento' && (
              <>
                <textarea
                  className="min-h-16 w-full rounded-md border bg-background p-2"
                  placeholder="Actualización del seguimiento"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
                <Button variant="outline" onClick={() => anotar(seleccionado.id)}>
                  Anotar seguimiento
                </Button>
                <textarea
                  className="min-h-16 w-full rounded-md border bg-background p-2"
                  placeholder="Solución u observación de cierre"
                  value={cierre}
                  onChange={(e) => setCierre(e.target.value)}
                />
                <Button variant="outline" onClick={() => cerrar(seleccionado.id)}>
                  Cerrar incidente
                </Button>
              </>
            )}
          </div>
        )}
    </div>
  );
}

function Foto({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  React.useEffect(() => {
    let activo = true;
    let url = '';
    fetch(fotoUrl(id), { headers: headers() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !activo) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      activo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (!src) return null;
  return <img src={src} alt="" className="h-16 w-16 rounded border object-cover" />;
}

function Fotos({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {ids.map((id) => (
        <Foto key={id} id={id} />
      ))}
    </div>
  );
}
