import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import {
  fetchServerGrupos,
  fetchServerIncidentes,
  comentarIncidente,
  atenderIncidente,
} from '../modules/correo/correoServerApi';
import {
  imeisCorreoForUser,
  userHasCorreoIncidentAccess,
  diaRelativoLabel,
  tipoEventoLabel,
} from '../modules/correo/incidentAccess';
import type { CorreoIncidente, GrupoCorreo } from '../modules/correo/types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Mail, RefreshCw, Loader2, MessageSquare, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../components/ui/utils';

export default function IncidentesCorreo() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoCorreo[]>([]);
  const [incidentes, setIncidentes] = useState<CorreoIncidente[]>([]);
  const [meta, setMeta] = useState({ hoy: '', ayer: '' });
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendiente' | 'atendida' | 'todos'>('pendiente');
  const [detalle, setDetalle] = useState<CorreoIncidente | null>(null);
  const [comentario, setComentario] = useState('');
  const [accionando, setAccionando] = useState(false);

  const imeis = useMemo(() => imeisCorreoForUser(user, grupos), [user, grupos]);
  const tieneAcceso = userHasCorreoIncidentAccess(user, grupos);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await fetchServerGrupos();
      setGrupos(g);
      const imeiList = imeisCorreoForUser(user, g);
      if (imeiList.length === 0) {
        setIncidentes([]);
        return;
      }
      const res = await fetchServerIncidentes({
        imeis: imeiList,
        estado: filtro === 'todos' ? undefined : filtro,
      });
      setIncidentes(res.data);
      setMeta({ hoy: res.meta.hoy, ayer: res.meta.ayer });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar incidentes');
    } finally {
      setLoading(false);
    }
  }, [user, filtro]);

  useEffect(() => {
    void load();
  }, [load]);

  const agrupados = useMemo(() => {
    const map = new Map<string, CorreoIncidente[]>();
    for (const inc of incidentes) {
      const key = inc.diaCalendario;
      const list = map.get(key) ?? [];
      list.push(inc);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [incidentes]);

  const handleComentar = async () => {
    if (detalle == null || !comentario.trim() || !user) return;
    setAccionando(true);
    try {
      const updated = await comentarIncidente(detalle.id, comentario.trim(), user.username);
      setDetalle(updated);
      setComentario('');
      await load();
      toast.success('Comentario registrado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setAccionando(false);
    }
  };

  const handleAtender = async () => {
    if (detalle == null || !user) return;
    setAccionando(true);
    try {
      await atenderIncidente(detalle.id, user.username, comentario.trim() || undefined);
      setDetalle(null);
      setComentario('');
      await load();
      toast.success('Incidente marcado como atendido');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setAccionando(false);
    }
  };

  if (!tieneAcceso && !loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No tiene equipos con alertas de correo asignadas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8 text-blue-600" />
            Incidentes de correo
          </h1>
          <p className="text-muted-foreground mt-1">
            Correos enviados por la plataforma, agrupados por día. Comente y cierre alarmas pendientes.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
        <TabsList>
          <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
          <TabsTrigger value="atendida">Atendidas</TabsTrigger>
          <TabsTrigger value="todos">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando…
        </div>
      ) : incidentes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay incidentes {filtro !== 'todos' ? filtro + 's' : ''} para sus equipos.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {agrupados.map(([dia, lista]) => (
            <Card key={dia}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {diaRelativoLabel(dia, meta.hoy, meta.ayer)}
                  <span className="text-sm font-normal text-muted-foreground ml-2">({dia})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lista.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => {
                      setDetalle(inc);
                      setComentario('');
                    }}
                    className="w-full text-left border rounded-lg p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge
                        className={
                          inc.tipoEvento === 'mantenimiento'
                            ? 'bg-amber-600'
                            : 'bg-blue-600'
                        }
                      >
                        {tipoEventoLabel(inc.tipoEvento)}
                      </Badge>
                      <Badge
                        variant={inc.estado === 'pendiente' ? 'destructive' : 'secondary'}
                      >
                        {inc.estado === 'pendiente' ? 'Pendiente' : 'Atendida'}
                      </Badge>
                      <Badge variant="outline">{inc.umbralHoras} h fuera de rango</Badge>
                    </div>
                    <p className="font-medium text-sm">
                      {inc.descripcionEquipo} · {inc.nombrePlataforma}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {inc.grupoNombre} · IMEI {inc.imei} ·{' '}
                      {new Date(inc.enviadoAt).toLocaleString('es-ES')}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={detalle != null} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detalle != null && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{detalle.subject}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge className={detalle.tipoEvento === 'mantenimiento' ? 'bg-amber-600' : 'bg-blue-600'}>
                    {tipoEventoLabel(detalle.tipoEvento)}
                  </Badge>
                  <Badge variant={detalle.estado === 'pendiente' ? 'destructive' : 'secondary'}>
                    {detalle.estado === 'pendiente' ? 'Pendiente' : 'Atendida'}
                  </Badge>
                </div>
                <p>
                  <strong>Día:</strong> {diaRelativoLabel(detalle.diaCalendario, meta.hoy, meta.ayer)}{' '}
                  ({detalle.diaCalendario})
                </p>
                <p>
                  <strong>Umbral:</strong> más de {detalle.umbralHoras} h (~{detalle.horasFueraRango} h
                  acumuladas)
                </p>
                <p>
                  <strong>Equipo:</strong> {detalle.descripcionEquipo} / {detalle.nombrePlataforma}
                </p>
                <p>
                  <strong>Destinatarios:</strong> {detalle.destinatarios.join(', ')}
                </p>
                {detalle.atendidaAt != null && (
                  <p className="text-emerald-700">
                    Atendida por {detalle.atendidaPor} el{' '}
                    {new Date(detalle.atendidaAt).toLocaleString('es-ES')}
                  </p>
                )}
                {(detalle.comentarios?.length ?? 0) > 0 && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                    <p className="font-medium flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      Comentarios
                    </p>
                    {detalle.comentarios.map((c) => (
                      <div key={c.id} className="text-xs border-l-2 pl-2 border-primary/40">
                        <span className="font-medium">{c.autor}</span> ·{' '}
                        {new Date(c.createdAt).toLocaleString('es-ES')}
                        <p className="mt-0.5">{c.texto}</p>
                      </div>
                    ))}
                  </div>
                )}
                {detalle.estado === 'pendiente' && (
                  <Textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Comentario de operaciones o mantenimiento…"
                    rows={3}
                  />
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {detalle.estado === 'pendiente' && (
                  <>
                    <Button
                      variant="outline"
                      disabled={accionando || !comentario.trim()}
                      onClick={() => void handleComentar()}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Comentar
                    </Button>
                    <Button disabled={accionando} onClick={() => void handleAtender()}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Marcar atendida
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
