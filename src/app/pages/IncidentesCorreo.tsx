import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import {
  fetchServerGrupos,
  fetchServerIncidentes,
  comentarIncidente,
  atenderIncidente,
  archiveIncidente,
  archiveAllIncidentes,
} from '../modules/correo/correoServerApi';
import {
  rowKeysCorreoActivosForUser,
  userHasCorreoIncidentAccess,
  incidenteVisibleParaUser,
  diaRelativoLabel,
  tipoEventoLabel,
} from '../modules/correo/incidentAccess';
import { formatUmbralAlerta } from '../modules/correo/types';
import type { CorreoIncidente, GrupoCorreo } from '../modules/correo/types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Mail,
  RefreshCw,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../components/ui/utils';
import { useT } from '../i18n';

function incidenteDiaKey(inc: CorreoIncidente): string {
  if (inc.diaCalendario) return inc.diaCalendario;
  const ref = inc.endedAt ?? inc.enviadoAt;
  return ref.slice(0, 10);
}

function incidenteTitulo(inc: CorreoIncidente): string {
  if (inc.subject) return inc.subject;
  if (inc.tipo === 'episodio_cerrado') {
    return `Episodio ${inc.alertKind === 'apagado' ? 'apagado' : 'fuera de rango'} cerrado`;
  }
  return `Alerta ${inc.alertKind ?? 'correo'}`;
}

export default function IncidentesCorreo() {
  const t = useT();
  const { user } = useAuth();
  const esSuperUser = user?.superUser === true;
  const [grupos, setGrupos] = useState<GrupoCorreo[]>([]);
  const [incidentes, setIncidentes] = useState<CorreoIncidente[]>([]);
  const [meta, setMeta] = useState({ hoy: '', ayer: '' });
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendiente' | 'atendida' | 'todos'>('pendiente');
  const [incluirArchivados, setIncluirArchivados] = useState(false);
  const [detalle, setDetalle] = useState<CorreoIncidente | null>(null);
  const [comentario, setComentario] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [archivarOpen, setArchivarOpen] = useState(false);
  const [archivarTodosOpen, setArchivarTodosOpen] = useState(false);

  const rowKeysUsuario = useMemo(() => rowKeysCorreoActivosForUser(user, grupos), [user, grupos]);
  const tieneAcceso = userHasCorreoIncidentAccess(user, grupos);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await fetchServerGrupos();
      setGrupos(g);

      if (!userHasCorreoIncidentAccess(user, g)) {
        setIncidentes([]);
        return;
      }

      const rowKeys = rowKeysCorreoActivosForUser(user, g);
      const res = await fetchServerIncidentes({
        todos: esSuperUser,
        rowKeys: esSuperUser ? undefined : rowKeys,
        estado: filtro === 'todos' ? undefined : filtro,
        incluirArchivados,
      });

      const visibles = esSuperUser
        ? res.data
        : res.data.filter((inc) => incidenteVisibleParaUser(user, inc, g));

      setIncidentes(visibles);
      setMeta({ hoy: res.meta.hoy, ayer: res.meta.ayer });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar incidentes');
    } finally {
      setLoading(false);
    }
  }, [user, filtro, esSuperUser, incluirArchivados]);

  useEffect(() => {
    void load();
  }, [load]);

  const agrupados = useMemo(() => {
    const map = new Map<string, CorreoIncidente[]>();
    for (const inc of incidentes) {
      const key = incidenteDiaKey(inc);
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

  const handleArchivar = async () => {
    if (detalle == null || !user || !esSuperUser) return;
    setAccionando(true);
    try {
      await archiveIncidente(detalle.id, user.username);
      setArchivarOpen(false);
      setDetalle(null);
      setComentario('');
      await load();
      toast.success('Incidente archivado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al archivar');
    } finally {
      setAccionando(false);
    }
  };

  const handleArchivarTodos = async () => {
    if (!user || !esSuperUser) return;
    setAccionando(true);
    try {
      const { count } = await archiveAllIncidentes(user.username);
      setArchivarTodosOpen(false);
      await load();
      toast.success(`${count} incidente(s) archivado(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al archivar');
    } finally {
      setAccionando(false);
    }
  };

  if (!tieneAcceso && !loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No tiene equipos activos en grupos de correo asignados a su cuenta.
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
            {t('incidentes.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {esSuperUser
              ? 'Gestión de incidentes. Archivar oculta registros sin borrarlos de la base.'
              : 'Incidentes de sus equipos activos en grupos de correo. Comente y cierre alarmas pendientes.'}
          </p>
          {!esSuperUser && rowKeysUsuario.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {rowKeysUsuario.length} equipo(s) activo(s) en su cuenta con alertas de correo.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {esSuperUser && (
            <Button
              variant="outline"
              onClick={() => setArchivarTodosOpen(true)}
              disabled={loading || accionando}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archivar todos
            </Button>
          )}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <TabsList>
            <TabsTrigger value="pendiente">Pendientes</TabsTrigger>
            <TabsTrigger value="atendida">Atendidas</TabsTrigger>
            <TabsTrigger value="todos">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Checkbox
            id="ver-archivados"
            checked={incluirArchivados}
            onCheckedChange={(v) => setIncluirArchivados(v === true)}
          />
          <Label htmlFor="ver-archivados" className="text-sm cursor-pointer">
            Ver archivados
          </Label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando…
        </div>
      ) : incidentes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay incidentes {filtro !== 'todos' ? filtro + 's' : ''}{' '}
            {incluirArchivados ? '(incl. archivados)' : 'activos'} para sus equipos.
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
                    className={cn(
                      'w-full text-left border rounded-lg p-3 hover:bg-muted/40 transition-colors',
                      inc.archivado && 'opacity-70 bg-muted/20'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {inc.tipoEvento != null && (
                        <Badge
                          className={
                            inc.tipoEvento === 'mantenimiento' ? 'bg-amber-600' : 'bg-blue-600'
                          }
                        >
                          {tipoEventoLabel(inc.tipoEvento)}
                        </Badge>
                      )}
                      {inc.tipo === 'episodio_cerrado' && (
                        <Badge variant="outline">Episodio cerrado</Badge>
                      )}
                      <Badge
                        variant={
                          inc.estado === 'pendiente'
                            ? 'destructive'
                            : inc.estado === 'cerrado'
                              ? 'secondary'
                              : 'secondary'
                        }
                      >
                        {inc.estado === 'pendiente'
                          ? 'Pendiente'
                          : inc.estado === 'cerrado'
                            ? 'Cerrado'
                            : 'Atendida'}
                      </Badge>
                      {inc.umbralHoras != null && (
                        <Badge variant="outline">
                          {formatUmbralAlerta(inc.umbralHoras)} fuera de rango
                        </Badge>
                      )}
                      {inc.archivado && (
                        <Badge variant="outline" className="gap-1">
                          <ArchiveRestore className="h-3 w-3" />
                          Archivado
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm">{incidenteTitulo(inc)}</p>
                    <p className="text-sm text-muted-foreground">
                      {inc.descripcionEquipo} · {inc.nombrePlataforma}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {inc.grupoNombre != null && <>{inc.grupoNombre} · </>}
                      IMEI {inc.imei} ·{' '}
                      {new Date(inc.enviadoAt).toLocaleString('es-PE', {
                        timeZone: 'America/Lima',
                      })}
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
                <DialogTitle className="text-base">{incidenteTitulo(detalle)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {detalle.tipoEvento != null && (
                    <Badge
                      className={
                        detalle.tipoEvento === 'mantenimiento' ? 'bg-amber-600' : 'bg-blue-600'
                      }
                    >
                      {tipoEventoLabel(detalle.tipoEvento)}
                    </Badge>
                  )}
                  <Badge
                    variant={detalle.estado === 'pendiente' ? 'destructive' : 'secondary'}
                  >
                    {detalle.estado === 'pendiente'
                      ? 'Pendiente'
                      : detalle.estado === 'cerrado'
                        ? 'Cerrado'
                        : 'Atendida'}
                  </Badge>
                  {detalle.archivado && <Badge variant="outline">Archivado</Badge>}
                </div>
                {detalle.diaCalendario != null && (
                  <p>
                    <strong>Día:</strong>{' '}
                    {diaRelativoLabel(detalle.diaCalendario, meta.hoy, meta.ayer)} (
                    {detalle.diaCalendario})
                  </p>
                )}
                {detalle.umbralHoras != null && (
                  <p>
                    <strong>Umbral:</strong> más de {formatUmbralAlerta(detalle.umbralHoras)}
                    {detalle.horasFueraRango != null && (
                      <> (~{detalle.horasFueraRango} h acumuladas)</>
                    )}
                  </p>
                )}
                {detalle.durationHours != null && detalle.since != null && (
                  <p>
                    <strong>Intervalo:</strong>{' '}
                    {new Date(detalle.since).toLocaleString('es-PE', {
                      timeZone: 'America/Lima',
                    })}{' '}
                    →{' '}
                    {detalle.endedAt
                      ? new Date(detalle.endedAt).toLocaleString('es-PE', {
                          timeZone: 'America/Lima',
                        })
                      : '—'}{' '}
                    (~{detalle.durationHours} h)
                  </p>
                )}
                <p>
                  <strong>Equipo:</strong> {detalle.descripcionEquipo} / {detalle.nombrePlataforma}
                </p>
                {(detalle.destinatarios?.length ?? 0) > 0 && (
                  <p>
                    <strong>Destinatarios:</strong> {detalle.destinatarios!.join(', ')}
                  </p>
                )}
                {detalle.atendidaAt != null && (
                  <p className="text-emerald-700">
                    Atendida por {detalle.atendidaPor} el{' '}
                    {new Date(detalle.atendidaAt).toLocaleString('es-PE', {
                      timeZone: 'America/Lima',
                    })}
                  </p>
                )}
                {detalle.archivadoAt != null && (
                  <p className="text-muted-foreground">
                    Archivado por {detalle.archivadoPor ?? '—'} el{' '}
                    {new Date(detalle.archivadoAt).toLocaleString('es-PE', {
                      timeZone: 'America/Lima',
                    })}
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
                        {new Date(c.createdAt).toLocaleString('es-PE', {
                          timeZone: 'America/Lima',
                        })}
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
                {esSuperUser && !detalle.archivado && (
                  <Button
                    variant="outline"
                    disabled={accionando}
                    onClick={() => setArchivarOpen(true)}
                    className="sm:mr-auto"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archivar
                  </Button>
                )}
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

      <AlertDialog open={archivarOpen} onOpenChange={setArchivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar incidente?</AlertDialogTitle>
            <AlertDialogDescription>
              El registro permanece en la base de datos. Puede verlo activando «Ver archivados».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accionando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={accionando}
              onClick={(e) => {
                e.preventDefault();
                void handleArchivar();
              }}
            >
              {accionando ? 'Archivando…' : 'Archivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archivarTodosOpen} onOpenChange={setArchivarTodosOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar todos los incidentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Se ocultarán de la lista principal pero no se eliminarán. Use «Ver archivados» para
              consultarlos después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accionando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={accionando}
              onClick={(e) => {
                e.preventDefault();
                void handleArchivarTodos();
              }}
            >
              {accionando ? 'Archivando…' : 'Archivar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
