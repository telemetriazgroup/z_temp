import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

type Paso = { id: string; titulo: string; detalle: string; status: string; hora: string };
type Sesion = {
  fase: string;
  qrDataUrl?: string | null;
  telefono: string | null;
  error: string | null;
  listo?: boolean;
  pasos?: Paso[];
};
type Chat = {
  telefono: string;
  total: number;
  ultimo_en: string;
  ultimo_texto: string;
  ultima_direccion: string;
};
type Mensaje = {
  id: number;
  telefono: string;
  direccion: string;
  texto: string;
  tipo: string | null;
  creado_en: string;
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

function tono(status: string) {
  if (status === 'ok') return 'text-emerald-600';
  if (status === 'error') return 'text-red-600';
  if (status === 'warn') return 'text-amber-600';
  return 'text-amber-500';
}

export default function WhatsAppAlertas() {
  const { user } = useAuth();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [telefono, setTelefono] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargarEstado = useCallback(async () => {
    const estado = await api<{ data: Sesion }>('/estado');
    setSesion(estado.data);
  }, []);

  const cargarChats = useCallback(async () => {
    const body = await api<{ data: Chat[] }>('/chats');
    setChats(body.data);
  }, []);

  const cargarMensajes = useCallback(async (tel: string, rango?: { desde?: string; hasta?: string }) => {
    if (!tel) return;
    const q = new URLSearchParams({ telefono: tel });
    if (rango?.desde) q.set('desde', rango.desde);
    if (rango?.hasta) q.set('hasta', rango.hasta);
    const body = await api<{ data: Mensaje[] }>(`/mensajes?${q}`);
    setMensajes(body.data);
  }, []);

  useEffect(() => {
    if (!userIsSuperAdmin(user)) return;
    cargarEstado().catch((e) => toast.error(e.message));
    cargarChats().catch(() => {});
    const t = setInterval(() => cargarEstado().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [user, cargarEstado, cargarChats]);

  async function accion(path: string, ok: string) {
    try {
      await api(path, { method: 'POST' });
      toast.success(ok);
      await cargarEstado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo completar');
    }
  }

  if (!userIsSuperAdmin(user)) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="h-8 w-8 text-emerald-600" />
          WhatsApp
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Esta sesión envía las alertas. Cada usuario registra su número, con prefijo 51, y completa la
          prueba. Recién entonces recibe avisos de los equipos de su cuenta.
        </p>
      </div>

      <Tabs defaultValue="configuracion">
        <TabsList>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="configuracion" className="space-y-4">
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Conexión WhatsApp</h2>
                <p className="text-sm">
                  <span className={sesion?.listo ? 'text-emerald-600' : 'text-amber-600'}>●</span>{' '}
                  {sesion?.fase ?? '…'}
                  {sesion?.telefono ? ` — ${sesion.telefono}` : ''}
                  {sesion?.listo ? ' · envío activo' : ''}
                </p>
                {sesion?.error && <p className="text-sm text-red-600">{sesion.error}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => cargarEstado().catch((e) => toast.error(e.message))}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
                </Button>
                <Button onClick={() => accion('/sesion', 'Vinculación iniciada')}>Vincular</Button>
                <Button
                  variant="outline"
                  disabled={!sesion?.listo}
                  onClick={() => accion('/prueba-envio', 'Mensaje de prueba enviado al número vinculado')}
                >
                  Probar envío
                </Button>
                <Button variant="outline" onClick={() => accion('/sesion/reiniciar', 'Sesión reiniciada')}>
                  Reiniciar
                </Button>
              </div>
            </div>
            {sesion?.qrDataUrl && (
              <img src={sesion.qrDataUrl} alt="Código QR de WhatsApp" className="h-56 w-56 rounded border bg-white p-2" />
            )}
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="font-semibold mb-2">Diagnóstico paso a paso</h2>
            <div className="divide-y">
              {(sesion?.pasos ?? []).map((p) => (
                <div key={p.id} className="flex gap-3 py-2 text-sm">
                  <span className={`w-16 shrink-0 font-medium ${tono(p.status)}`}>{p.status}</span>
                  <div>
                    <div className="font-medium">{p.titulo}</div>
                    <div className="text-muted-foreground">
                      {p.detalle}
                      {p.hora ? ` · ${p.hora}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {(sesion?.pasos ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Aún no hay pasos. Pulse Vincular.</p>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="historial">
          <section className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <h2 className="font-semibold text-sm">Números</h2>
                <Button size="sm" variant="outline" onClick={() => cargarChats().catch((e) => toast.error(e.message))}>
                  Actualizar
                </Button>
              </div>
              <div className="max-h-[32rem] overflow-auto">
                {chats.map((c) => (
                  <button
                    key={c.telefono}
                    type="button"
                    className={`block w-full border-b px-3 py-2 text-left text-sm ${telefono === c.telefono ? 'bg-muted' : ''}`}
                    onClick={() => {
                      setTelefono(c.telefono);
                      setDesde('');
                      setHasta('');
                      cargarMensajes(c.telefono).catch((e) => toast.error(e.message));
                    }}
                  >
                    <div className="font-medium">{c.telefono}</div>
                    <div className="truncate text-muted-foreground">{c.ultimo_texto}</div>
                    <div className="text-xs text-muted-foreground">{c.total} mensajes</div>
                  </button>
                ))}
                {chats.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin conversaciones.</p>}
              </div>
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Desde
                  <input type="date" className="mt-1 block h-9 rounded-md border bg-background px-2" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </label>
                <label className="text-sm">
                  Hasta
                  <input type="date" className="mt-1 block h-9 rounded-md border bg-background px-2" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </label>
                <Button
                  variant="outline"
                  disabled={!telefono}
                  onClick={() => cargarMensajes(telefono, { desde, hasta }).catch((e) => toast.error(e.message))}
                >
                  Buscar por fecha
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {telefono
                  ? `Últimos 100 de ${telefono}. Con fechas se amplía la consulta de ese intervalo.`
                  : 'Elija un número.'}
              </p>
              <div className="flex max-h-[28rem] flex-col gap-2 overflow-auto rounded bg-muted/30 p-3">
                {[...mensajes].reverse().map((m) => {
                  const usuario = m.direccion === 'in';
                  return (
                    <div key={m.id} className={`flex ${usuario ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          usuario ? 'bg-background border' : 'bg-emerald-600 text-white'
                        }`}
                      >
                        <div className={`text-[11px] ${usuario ? 'text-muted-foreground' : 'text-emerald-100'}`}>
                          {usuario ? 'Usuario' : 'ZTRACK'} · {new Date(m.creado_en).toLocaleString('es-PE')}
                        </div>
                        <p className="whitespace-pre-wrap">{m.texto}</p>
                      </div>
                    </div>
                  );
                })}
                {telefono && mensajes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay mensajes en ese corte.</p>
                )}
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
