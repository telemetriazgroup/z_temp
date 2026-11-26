import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import type { DispositivoUltimoEstado } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
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
type ParticipanteWa = { jid: string; numero: string; nombre: string; admin: boolean };
type NombreEquipo = { rowKey: string; imei: string; codigo: string; nombre: string; zgru: string | null };
type GrupoCorreoListo = {
  id: string;
  nombre: string;
  origen?: 'correo' | 'administracion';
  equipos: NombreEquipo[];
};
type GrupoWa = {
  jid: string;
  nombre: string;
  participantes: ParticipanteWa[];
  activo: boolean;
  umbralFueraRango: number;
  umbralApagado: number;
  umbralFueraLinea: number;
  menciones: string[];
  nombres?: Record<string, string>;
  rowKeys: string[];
  horaDesde: number;
  horaHasta: number;
};
type HistorialGrupo = { jid: string; texto: string; tipo: string; at: string };

function claveEquipo(d: DispositivoUltimoEstado) {
  return d.codigo ? `${d.codigo}-${d.imei}` : d.imei;
}

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
  const [espera, setEspera] = useState('2');
  const esperaTocada = useRef(false);
  const [grupos, setGrupos] = useState<GrupoWa[]>([]);
  const [historial, setHistorial] = useState<HistorialGrupo[]>([]);
  const [grupoAbierto, setGrupoAbierto] = useState('');
  const [flota, setFlota] = useState<DispositivoUltimoEstado[]>([]);
  const [buscaEquipo, setBuscaEquipo] = useState('');
  const [gruposCorreo, setGruposCorreo] = useState<GrupoCorreoListo[]>([]);
  const [nombresEquipo, setNombresEquipo] = useState<NombreEquipo[]>([]);
  const [correoElegido, setCorreoElegido] = useState('');

  const cargarEstado = useCallback(async () => {
    const estado = await api<{ data: Sesion; tiempos?: { gapChatSeg?: number } }>('/estado');
    setSesion(estado.data);
    if (!esperaTocada.current && estado.tiempos?.gapChatSeg != null) {
      setEspera(String(estado.tiempos.gapChatSeg));
    }
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

  const cargarGruposGuardados = useCallback(async () => {
    const [body, correo] = await Promise.all([
      api<{ data: GrupoWa[] }>('/grupos-guardados'),
      api<{ data: { grupos: GrupoCorreoListo[]; nombres: NombreEquipo[] } }>('/grupos-correo'),
    ]);
    setGrupos(body.data);
    setGruposCorreo(correo.data.grupos || []);
    setNombresEquipo(correo.data.nombres || []);
    if (flota.length === 0) {
      const flotaRes = await fetchUltimoEstadoDispositivos();
      setFlota(flotaRes.data.dispositivos ?? []);
    }
  }, [flota.length]);

  const cargarHistorialGrupo = useCallback(async (jid: string) => {
    const q = new URLSearchParams({ jid });
    const body = await api<{ data: HistorialGrupo[] }>(`/grupos-historial?${q}`);
    setHistorial(body.data);
  }, []);

  useEffect(() => {
    if (!userIsSuperAdmin(user)) return;
    cargarEstado().catch((e) => toast.error(e.message));
    cargarChats().catch(() => {});
    cargarGruposGuardados().catch(() => {});
    const t = setInterval(() => cargarEstado().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [user, cargarEstado, cargarChats, cargarGruposGuardados]);

  function etiquetaDe(rowKey: string, d?: DispositivoUltimoEstado) {
    const imeiClave = d?.imei || String(rowKey).match(/(\d{14,16})$/)?.[1] || '';
    const n = nombresEquipo.find((x) => x.rowKey === rowKey || (imeiClave && x.imei === imeiClave));
    const titulo = n?.nombre || '';
    const zgru = n?.zgru && !titulo.toUpperCase().includes(n.zgru) ? n.zgru : '';
    const codigo = d?.codigo || n?.codigo || '';
    const imei = d?.imei || n?.imei || rowKey;
    return [titulo, zgru, codigo, imei].filter(Boolean).join(' · ');
  }

  async function leerGrupos() {
    try {
      const [body, correo] = await Promise.all([
        api<{ data: GrupoWa[] }>('/grupos'),
        api<{ data: { grupos: GrupoCorreoListo[]; nombres: NombreEquipo[] } }>('/grupos-correo'),
      ]);
      setGrupos(body.data);
      setGruposCorreo(correo.data.grupos || []);
      setNombresEquipo(correo.data.nombres || []);
      if (flota.length === 0) {
        const flotaRes = await fetchUltimoEstadoDispositivos();
        setFlota(flotaRes.data.dispositivos ?? []);
      }
      toast.success(`${body.data.length} grupo(s) leídos. Ninguno se activa solo.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron leer los grupos');
    }
  }

  function patchGrupo(jid: string, parcial: Partial<GrupoWa>) {
    setGrupos((prev) => prev.map((g) => (g.jid === jid ? { ...g, ...parcial } : g)));
  }

  async function guardarGrupo(grupo: GrupoWa) {
    try {
      const body = await api<{ data: GrupoWa }>('/grupos', {
        method: 'PUT',
        body: JSON.stringify(grupo),
      });
      patchGrupo(grupo.jid, body.data);
      toast.success(
        body.data.activo
          ? `Alertas activas solo para ${grupo.nombre}`
          : `${grupo.nombre} quedó sin alertas`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el grupo');
    }
  }

  async function guardarEspera() {
    const n = Number(espera);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      toast.error('La espera va de 1 a 10 segundos');
      return;
    }
    try {
      await api('/ajustes', { method: 'PUT', body: JSON.stringify({ gapChatSeg: n }) });
      esperaTocada.current = false;
      toast.success(`El bot espera ${n} s entre respuestas del mismo número`);
      await cargarEstado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

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

          <section className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold">Espera entre respuestas</h2>
            <p className="text-sm text-muted-foreground">
              Segundos que el bot espera antes de contestar al mismo número. Mínimo 1, máximo 10. Las alertas
              siguen en su propio ritmo y no usan este valor.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10}
                step={1}
                className="w-24"
                value={espera}
                onChange={(e) => {
                  esperaTocada.current = true;
                  setEspera(e.target.value);
                }}
              />
              <span className="text-sm text-muted-foreground">segundos</span>
              <Button variant="outline" onClick={() => guardarEspera()}>
                Guardar
              </Button>
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Grupos de WhatsApp</h2>
                <p className="text-sm text-muted-foreground max-w-3xl">
                  Estar en un grupo no activa las alertas. Elija el grupo, los equipos por su nombre y a quién
                  saludar, y guarde.                   El aviso automático de cada grupo tiene su propio horario (de 5:00 a 22:00 si no lo cambia),
                  hora de Perú, con el saludo del momento, el análisis de 12 h y la gráfica. Fuera de ese
                  horario el grupo no atiende solo: hay que etiquetar al bot. Un grupo activo queda guardado
                  y sus respuestas quedan en el historial; no hace falta volver a leerlo. Las alertas de
                  WhatsApp a cada número van de 5:00 a 22:00. El correo no usa ese horario. Si alguien etiqueta al bot, la búsqueda es solo entre los
                  equipos agregados a ese grupo. Si etiqueta y no escribe un nombre, el bot no contesta.
                  A los 5 minutos sin consulta tiene que etiquetar de nuevo.
                </p>
              </div>
              <Button variant="outline" onClick={() => leerGrupos()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Leer grupos
              </Button>
            </div>
            {grupos.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay grupos cargados.</p>
            )}
            <div className="space-y-3">
              {grupos.map((grupo) => {
                const abierto = grupoAbierto === grupo.jid;
                const q = buscaEquipo.trim().toLowerCase();
                const marcado = (d: DispositivoUltimoEstado) => grupo.rowKeys.includes(claveEquipo(d));
                const coincide = (texto: string) => !q || texto.toLowerCase().includes(q);
                const agregados = flota.filter(marcado).filter((d) => coincide(etiquetaDe(claveEquipo(d), d)));
                const huerfanos = grupo.rowKeys
                  .filter((k) => !flota.some((d) => claveEquipo(d) === k))
                  .filter((k) => coincide(etiquetaDe(k)));
                const paraSumar = q
                  ? flota
                      .filter((d) => !marcado(d) && coincide(etiquetaDe(claveEquipo(d), d)))
                      .slice(0, 12)
                  : [];
                return (
                  <div key={grupo.jid} className="rounded-md border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      onClick={() => {
                        const siguiente = abierto ? '' : grupo.jid;
                        setGrupoAbierto(siguiente);
                        if (siguiente) cargarHistorialGrupo(siguiente).catch(() => setHistorial([]));
                      }}
                    >
                      <span>
                        <span className="font-medium block">{grupo.nombre}</span>
                        <span className="text-xs text-muted-foreground">
                          {grupo.participantes.length} participante(s)
                          {grupo.activo ? ' · alertas activas' : ' · sin alertas'}
                        </span>
                      </span>
                      <span className={grupo.activo ? 'text-emerald-600 text-sm' : 'text-muted-foreground text-sm'}>
                        {grupo.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                    {abierto && (
                      <div className="space-y-3 border-t px-3 py-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={grupo.activo}
                            onChange={(e) => patchGrupo(grupo.jid, { activo: e.target.checked })}
                          />
                          Enviar alertas a este grupo
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs">
                            Alertar desde (hora Perú)
                            <Input
                              type="number"
                              min={0}
                              max={23}
                              className="mt-1"
                              value={grupo.horaDesde ?? 5}
                              onChange={(e) => patchGrupo(grupo.jid, { horaDesde: Number(e.target.value) })}
                            />
                          </label>
                          <label className="text-xs">
                            Hasta (no incluye esta hora)
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              className="mt-1"
                              value={grupo.horaHasta ?? 22}
                              onChange={(e) => patchGrupo(grupo.jid, { horaHasta: Number(e.target.value) })}
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="text-xs">
                            Fuera de rango (horas)
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              className="mt-1"
                              value={grupo.umbralFueraRango}
                              onChange={(e) => patchGrupo(grupo.jid, { umbralFueraRango: Number(e.target.value) })}
                            />
                          </label>
                          <label className="text-xs">
                            Apagado (horas)
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              className="mt-1"
                              value={grupo.umbralApagado}
                              onChange={(e) => patchGrupo(grupo.jid, { umbralApagado: Number(e.target.value) })}
                            />
                          </label>
                          <label className="text-xs">
                            Fuera de línea (horas)
                            <Input
                              type="number"
                              min={1}
                              max={24}
                              className="mt-1"
                              value={grupo.umbralFueraLinea}
                              onChange={(e) => patchGrupo(grupo.jid, { umbralFueraLinea: Number(e.target.value) })}
                            />
                          </label>
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-1">Etiquetar en el mensaje</p>
                          <p className="mb-1 text-xs text-muted-foreground">
                            El nombre es el trato. Si esa persona convoca al bot, la saluda así: Buenos días Sr. Mario.
                          </p>
                          <div className="max-h-48 overflow-auto rounded border">
                            {grupo.participantes.length === 0 && (
                              <p className="p-2 text-xs text-muted-foreground">Este grupo no devolvió participantes.</p>
                            )}
                            {grupo.participantes.map((p) => (
                              <div key={p.jid} className="flex items-center gap-2 border-b px-2 py-1">
                                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={grupo.menciones.includes(p.jid)}
                                    onChange={(e) => {
                                      const menciones = e.target.checked
                                        ? [...grupo.menciones, p.jid]
                                        : grupo.menciones.filter((x) => x !== p.jid);
                                      patchGrupo(grupo.jid, { menciones });
                                    }}
                                  />
                                  <span className="truncate">
                                    {p.admin ? 'admin · ' : ''}
                                    {p.numero}
                                  </span>
                                </label>
                                <Input
                                  className="h-7 w-36 text-xs"
                                  placeholder="Sr. Mario"
                                  value={grupo.nombres?.[p.jid] ?? ''}
                                  onChange={(e) =>
                                    patchGrupo(grupo.jid, {
                                      nombres: { ...(grupo.nombres || {}), [p.jid]: e.target.value },
                                    })
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-1">Equipos que este grupo recibe</p>
                          <p className="mb-2 text-xs text-muted-foreground">
                            El selector usa los dos: grupos de correo ({gruposCorreo.filter((g) => g.origen !== 'administracion').length}) y grupos de Administración ({gruposCorreo.filter((g) => g.origen === 'administracion').length}). Agregue uno y después el otro; cada uno suma sus equipos.
                          </p>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <select
                              className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm"
                              value={correoElegido}
                              onChange={(e) => setCorreoElegido(e.target.value)}
                            >
                              <option value="">Agregar un grupo ya armado</option>
                              <optgroup label="Correo">
                                {gruposCorreo
                                  .filter((g) => g.origen !== 'administracion')
                                  .map((g) => (
                                    <option key={`correo:${g.id}`} value={`correo:${g.id}`}>
                                      {g.nombre} ({g.equipos.length})
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Administración">
                                {gruposCorreo
                                  .filter((g) => g.origen === 'administracion')
                                  .map((g) => (
                                    <option key={`administracion:${g.id}`} value={`administracion:${g.id}`}>
                                      {g.nombre} ({g.equipos.length})
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const origen = gruposCorreo.find(
                                  (g) => `${g.origen === 'administracion' ? 'administracion' : 'correo'}:${g.id}` === correoElegido
                                );
                                if (!origen) {
                                  toast.error('Elija un grupo de correo o de Administración');
                                  return;
                                }
                                const claves = origen.equipos.map((e) => {
                                  const exacto = flota.find((d) => claveEquipo(d) === e.rowKey);
                                  if (exacto) return e.rowKey;
                                  const mismos = flota.filter((d) => d.imei && d.imei === e.imei);
                                  if (mismos.length === 1) return claveEquipo(mismos[0]);
                                  return e.rowKey;
                                });
                                const rowKeys = [...new Set([...grupo.rowKeys, ...claves.filter(Boolean)])];
                                patchGrupo(grupo.jid, { rowKeys });
                                const lado = origen.origen === 'administracion' ? 'Administración' : 'Correo';
                                toast.success(
                                  `${claves.length} equipo(s) de ${origen.nombre} (${lado}) quedaron marcados. Guarde este grupo. El interruptor no cambia.`
                                );
                              }}
                            >
                              Agregar esos equipos
                            </Button>
                          </div>
                          <Input
                            value={buscaEquipo}
                            onChange={(e) => setBuscaEquipo(e.target.value)}
                            placeholder="Buscar entre los agregados por nombre, ZGRU o IMEI"
                            className="mb-2"
                          />
                          <div className="max-h-52 overflow-auto rounded border">
                            {agregados.length === 0 && huerfanos.length === 0 && paraSumar.length === 0 && (
                              <p className="p-2 text-xs text-muted-foreground">
                                {q
                                  ? 'Ningún equipo agregado coincide con ese nombre.'
                                  : 'Todavía no hay equipos agregados. Escriba un nombre o agregue un grupo de correo o de Administración.'}
                              </p>
                            )}
                            {(agregados.length > 0 || huerfanos.length > 0) && (
                              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Agregados</p>
                            )}
                            {huerfanos.map((clave) => (
                              <label key={clave} className="flex items-center gap-2 border-b px-2 py-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => patchGrupo(grupo.jid, { rowKeys: grupo.rowKeys.filter((x) => x !== clave) })}
                                />
                                <span className="truncate">{etiquetaDe(clave)}</span>
                              </label>
                            ))}
                            {agregados.map((d) => {
                              const clave = claveEquipo(d);
                              return (
                                <label key={clave} className="flex items-center gap-2 border-b px-2 py-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked
                                    onChange={() => patchGrupo(grupo.jid, { rowKeys: grupo.rowKeys.filter((x) => x !== clave) })}
                                  />
                                  <span className="truncate">{etiquetaDe(clave, d)}</span>
                                </label>
                              );
                            })}
                            {paraSumar.length > 0 && (
                              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Para agregar</p>
                            )}
                            {paraSumar.map((d) => {
                              const clave = claveEquipo(d);
                              return (
                                <label key={clave} className="flex items-center gap-2 border-b px-2 py-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={false}
                                    onChange={() => patchGrupo(grupo.jid, { rowKeys: [...grupo.rowKeys, clave] })}
                                  />
                                  <span className="truncate">{etiquetaDe(clave, d)}</span>
                                </label>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {grupo.rowKeys.length} equipo(s) marcado(s).
                          </p>
                        </div>
                        <Button onClick={() => guardarGrupo(grupo)}>Guardar este grupo</Button>
                        <div>
                          <p className="text-xs font-medium mb-1">Historial de respuestas</p>
                          <div className="max-h-40 overflow-auto rounded border">
                            {historial.length === 0 && (
                              <p className="p-2 text-xs text-muted-foreground">Todavía no hay respuestas guardadas de este grupo.</p>
                            )}
                            {historial.map((h, i) => (
                              <div key={`${h.at}-${i}`} className="border-b px-2 py-1 text-xs">
                                <p className="text-[11px] text-muted-foreground">{new Date(h.at).toLocaleString('es-PE', { timeZone: 'America/Lima' })} · {h.tipo}</p>
                                <p className="whitespace-pre-wrap">{h.texto}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
