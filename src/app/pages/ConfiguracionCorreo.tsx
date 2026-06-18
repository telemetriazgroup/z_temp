import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import type { DispositivoUltimoEstado } from '../types';
import { useAuth } from '../AuthContext';
import { userMayAccessDispositivo, displayNameForDevice } from '../modules/usuario';
import { readDeviceLocalNames } from '../lib/deviceLocalNames';
import {
  readSmtpConfig,
  persistSmtpConfig,
  getGruposCorreo,
  parseEmailList,
  normalizeUmbrales,
  buildFueraDeRangoEmail,
  deviceRowKey,
  UMBRALES_HORAS_DISPONIBLES,
  DEFAULT_UMBRALES_HORAS,
  type SmtpConfig,
  type GrupoCorreo,
  type GrupoCorreoDevice,
  type CorreoTipoEvento,
  ALERT_POLL_INTERVAL_MS,
} from '../modules/correo';
import {
  fetchCorreoStatus,
  fetchServerSmtp,
  saveServerSmtp,
  fetchServerGrupos,
  saveServerGrupo,
  deleteServerGrupo,
  fetchServerEnvios,
  runServerAlertCycle,
  migrateLocalCorreoToServer,
  sendTestEmailViaServer,
} from '../modules/correo/correoServerApi';
import type { CorreoEnvioLog, CorreoServerStatus } from '../modules/correo/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { generateGrupoCorreoId } from '../modules/correo/grupoCorreoRepository';
import { DeviceSearchPicker } from '../components/DeviceSearchPicker';
import {
  Mail,
  Save,
  Send,
  Loader2,
  RefreshCw,
  Users,
  History,
  Plus,
  Pencil,
  Trash2,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function emptyGrupo(): Omit<GrupoCorreo, 'createdAt' | 'updatedAt'> {
  return {
    id: generateGrupoCorreoId(),
    nombre: '',
    cliente: 'IFF',
    emails: [],
    devices: [],
    enabled: true,
  };
}

export default function ConfiguracionCorreo() {
  const { user } = useAuth();
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('ZTRACK TELEMETRY');
  const [dispositivos, setDispositivos] = useState<DispositivoUltimoEstado[]>([]);
  const [grupos, setGrupos] = useState<GrupoCorreo[]>([]);
  const [envioLogs, setEnvioLogs] = useState<CorreoEnvioLog[]>([]);
  const [serverStatus, setServerStatus] = useState<CorreoServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [editing, setEditing] = useState<Omit<GrupoCorreo, 'createdAt' | 'updatedAt'> | null>(
    null
  );
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | undefined>(undefined);
  const [emailsDraft, setEmailsDraft] = useState('');

  const localNames = useMemo(() => readDeviceLocalNames(), []);

  const loadServerConfig = useCallback(async () => {
    try {
      let g = await fetchServerGrupos();
      const smtpSrv = await fetchServerSmtp();
      if (g.length === 0) {
        const localG = getGruposCorreo();
        const localS = readSmtpConfig();
        if (localG.length > 0 || localS) {
          await migrateLocalCorreoToServer({ smtp: localS, grupos: localG });
          g = await fetchServerGrupos();
          toast.message('Configuración local migrada al servidor');
        }
      }
      setGrupos(g);
      if (smtpSrv) {
        setSmtpUser(smtpSrv.user);
        setSmtpFromName(smtpSrv.fromName);
        if (!smtpSrv.hasPassword) setSmtpPass('');
      }
      const logs = await fetchServerEnvios(80);
      setEnvioLogs(logs);
      setServerStatus(await fetchCorreoStatus());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar config del servidor');
    }
  }, []);

  useEffect(() => {
    void loadServerConfig();
  }, [loadServerConfig]);

  const loadDevices = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchUltimoEstadoDispositivos();
      setDispositivos(res.data.dispositivos.filter((d) => userMayAccessDispositivo(user, d)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar equipos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const refreshLogs = async () => {
    setEnvioLogs(await fetchServerEnvios(80));
    setServerStatus(await fetchCorreoStatus());
  };
  const refreshGrupos = async () => setGrupos(await fetchServerGrupos());

  const smtpConfig = (): SmtpConfig | null => {
    const userVal = smtpUser.trim();
    const pass = smtpPass.replace(/\s/g, '');
    if (!userVal || !pass) return null;
    return {
      user: userVal,
      appPassword: pass,
      fromName: smtpFromName.trim() || 'ZTRACK TELEMETRY',
    };
  };

  const handleSaveSmtp = async () => {
    const cfg = smtpConfig();
    if (cfg == null) {
      toast.error('Indique correo Gmail y clave de aplicación');
      return;
    }
    try {
      await saveServerSmtp(cfg);
      persistSmtpConfig(cfg);
      setServerStatus(await fetchCorreoStatus());
      toast.success('Remitente guardado en el servidor');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar SMTP');
    }
  };

  const closeGrupoDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setEditingCreatedAt(undefined);
    setIsEditingExisting(false);
    setEmailsDraft('');
  };

  const openNewGrupo = () => {
    setEditing(emptyGrupo());
    setEditingCreatedAt(undefined);
    setIsEditingExisting(false);
    setEmailsDraft('');
    setDialogOpen(true);
    if (dispositivos.length === 0 && !loading) void loadDevices();
  };

  const openEditGrupo = (g: GrupoCorreo) => {
    setEditing({
      id: g.id,
      nombre: g.nombre,
      cliente: g.cliente,
      emails: [...g.emails],
      devices: g.devices.map((d) => ({ ...d, umbralesHoras: [...normalizeUmbrales(d.umbralesHoras)] })),
      enabled: g.enabled,
    });
    setEditingCreatedAt(g.createdAt);
    setIsEditingExisting(true);
    setEmailsDraft(g.emails.join(', '));
    setDialogOpen(true);
    if (dispositivos.length === 0 && !loading) void loadDevices();
  };

  const handleSaveGrupo = async () => {
    if (editing == null) return;
    if (!editing.nombre.trim()) {
      toast.error('El nombre del grupo es obligatorio');
      return;
    }
    const emails = parseEmailList(emailsDraft);
    if (emails.length === 0) {
      toast.error('Indique al menos un correo destinatario');
      return;
    }
    try {
      await saveServerGrupo({
        ...editing,
        nombre: editing.nombre.trim(),
        cliente: editing.cliente.trim() || 'Cliente',
        emails,
        createdAt: editingCreatedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await refreshGrupos();
      closeGrupoDialog();
      toast.success(isEditingExisting ? 'Grupo actualizado en servidor' : 'Grupo creado en servidor');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar grupo');
    }
  };

  const handleDeleteGrupo = async (id: string) => {
    try {
      await deleteServerGrupo(id);
      await refreshGrupos();
      toast.success('Grupo eliminado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const deviceSearchOptions = useMemo(() => {
    const inGroup = new Set(editing?.devices.map((d) => d.rowKey) ?? []);
    return dispositivos.map((d) => {
      const rk = deviceRowKey(d);
      const nombre = displayNameForDevice(user, d.imei, rk, localNames, SIN_ASIGNAR);
      const codigo = d.codigo ?? '';
      const label = `${codigo} · ${d.imei} · ${nombre}`;
      const searchText = `${codigo} ${d.imei} ${nombre} ${rk}`.toLowerCase();
      const already = inGroup.has(rk);
      return {
        rowKey: rk,
        label,
        searchText,
        disabled: already,
        disabledReason: already ? 'Ya está en este grupo' : undefined,
      };
    });
  }, [dispositivos, user, localNames, editing?.devices]);

  const addDeviceToGrupo = (rowKey: string) => {
    if (editing == null) return;
    if (editing.devices.some((d) => d.rowKey === rowKey)) {
      toast.error('El equipo ya está en el grupo');
      return;
    }
    const d = dispositivos.find((dev) => deviceRowKey(dev) === rowKey);
    if (d == null) {
      toast.error('Equipo no encontrado. Pulse «Equipos» para actualizar el listado.');
      return;
    }
    setEditing({
      ...editing,
      devices: [
        ...editing.devices,
        {
          rowKey,
          imei: d.imei,
          codigo: d.codigo ?? '—',
          descripcionEquipo: '',
          umbralesHoras: [...DEFAULT_UMBRALES_HORAS],
          tipoEvento: 'operaciones',
          enabled: true,
        },
      ],
    });
    toast.success('Equipo agregado al grupo');
  };

  const updateDeviceInGrupo = (rowKey: string, patch: Partial<GrupoCorreoDevice>) => {
    if (editing == null) return;
    setEditing({
      ...editing,
      devices: editing.devices.map((d) => (d.rowKey === rowKey ? { ...d, ...patch } : d)),
    });
  };

  const toggleUmbral = (rowKey: string, hora: number, checked: boolean) => {
    if (editing == null) return;
    const dev = editing.devices.find((d) => d.rowKey === rowKey);
    if (dev == null) return;
    const current = normalizeUmbrales(dev.umbralesHoras);
    const next = checked
      ? normalizeUmbrales([...current, hora])
      : current.filter((h) => h !== hora);
    updateDeviceInGrupo(rowKey, { umbralesHoras: next.length ? next : [2] });
  };

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const result = await runServerAlertCycle();
      await refreshLogs();
      if (result.emailsSent > 0) {
        toast.success(`${result.emailsSent} correo(s) enviado(s) por el servidor`);
      } else if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else {
        toast.message('Ciclo del servidor completado sin envíos pendientes');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en ciclo del servidor');
    } finally {
      setRunningNow(false);
    }
  };

  const handleSendGroupTest = async (grupo: GrupoCorreo) => {
    const cfg = smtpConfig();
    if (cfg == null) {
      toast.error('Configure el remitente Gmail primero');
      return;
    }
    if (grupo.devices.length === 0) {
      toast.error('El grupo no tiene equipos');
      return;
    }
    const assignment = grupo.devices.find((d) => d.enabled) ?? grupo.devices[0];
    const dispositivo = dispositivos.find((d) => deviceRowKey(d) === assignment.rowKey);
    if (dispositivo == null) {
      toast.error('Equipo no encontrado en telemetría actual');
      return;
    }

    persistSmtpConfig(cfg);
    setSendingTest(true);
    try {
      const nombrePlat = displayNameForDevice(
        user,
        dispositivo.imei,
        assignment.rowKey,
        localNames,
        SIN_ASIGNAR
      );
      const desc = assignment.descripcionEquipo?.trim() || nombrePlat;
      const content = buildFueraDeRangoEmail({
        dispositivo,
        dispositivoReeferId: desc,
        nombrePlataforma: nombrePlat,
        cliente: grupo.cliente,
        umbralHoras: 3,
        horasFueraRango: 3,
        esPrueba: true,
      });
      await sendTestEmailViaServer({
        smtp: cfg,
        to: grupo.emails,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      toast.success(`Prueba enviada a ${grupo.emails.join(', ')}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar prueba');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8 text-blue-600" />
            Correo y alertas
          </h1>
          <p className="text-muted-foreground mt-1">
            Configuración en servidor. El envío de alertas corre automáticamente cada{' '}
            {ALERT_POLL_INTERVAL_MS / 60000} minutos sin necesidad de sesión activa.
          </p>
          {serverStatus?.lastRun != null && (
            <p className="text-xs text-muted-foreground mt-1">
              Último ciclo servidor:{' '}
              {new Date(serverStatus.lastRun.checkedAt).toLocaleString('es-ES')} ·{' '}
              {serverStatus.lastRun.emailsSent} enviados · {serverStatus.incidentesPendientes}{' '}
              incidentes pendientes
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadDevices()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Equipos
          </Button>
          <Button variant="secondary" onClick={() => void handleRunNow()} disabled={runningNow}>
            {runningNow ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Ejecutar ahora
          </Button>
        </div>
      </div>

      <Tabs defaultValue="grupos">
        <TabsList>
          <TabsTrigger value="remitente">Remitente</TabsTrigger>
          <TabsTrigger value="grupos">Grupos de correo</TabsTrigger>
          <TabsTrigger value="log">Registro de envíos</TabsTrigger>
        </TabsList>

        <TabsContent value="remitente" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Remitente principal (Gmail)</CardTitle>
              <CardDescription>
                Ejemplo: ZTRACK TELEMETRY &lt;ztrack@zgroup.com.pe&gt; con clave de aplicación Google.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="smtp-user">Correo Gmail remitente</Label>
                <Input
                  id="smtp-user"
                  type="email"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="ztrack@zgroup.com.pe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Clave de aplicación</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-name">Nombre remitente</Label>
                <Input
                  id="smtp-name"
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={handleSaveSmtp}>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar remitente
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grupos" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Un grupo agrupa destinatarios y uno o más dispositivos. Cada umbral (2 h, 3 h …) se
              envía una sola vez por episodio fuera de rango.
            </p>
            <Button onClick={openNewGrupo}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo grupo
            </Button>
          </div>

          {error != null && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-4">
            {grupos.map((g) => (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {g.nombre}
                        {!g.enabled && <Badge variant="secondary">Inactivo</Badge>}
                      </CardTitle>
                      <CardDescription>
                        Cliente: {g.cliente} · {g.emails.join(', ')}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openEditGrupo(g)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={sendingTest}
                        onClick={() => void handleSendGroupTest(g)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteGrupo(g.id)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Equipo</TableHead>
                        <TableHead>Descripción (Reefer ID)</TableHead>
                        <TableHead>Umbrales</TableHead>
                        <TableHead>Estado telemetría</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.devices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            Sin equipos asignados
                          </TableCell>
                        </TableRow>
                      )}
                      {g.devices.map((dev) => {
                        const live = dispositivos.find((d) => deviceRowKey(d) === dev.rowKey);
                        return (
                          <TableRow key={dev.rowKey}>
                            <TableCell className="text-xs font-mono">
                              {dev.codigo} · {dev.imei}
                            </TableCell>
                            <TableCell>{dev.descripcionEquipo?.trim() || '(nombre plataforma)'}</TableCell>
                            <TableCell className="text-xs">
                              {dev.tipoEvento === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones'} ·{' '}
                              {normalizeUmbrales(dev.umbralesHoras).join(', ')} h
                            </TableCell>
                            <TableCell>
                              {!dev.enabled && <Badge variant="secondary">Off</Badge>}
                              {dev.enabled && live?.en_rango === false && (
                                <Badge className="bg-red-600">FUERA DE RANGO</Badge>
                              )}
                              {dev.enabled && live?.en_rango === true && (
                                <Badge className="bg-emerald-600">EN RANGO</Badge>
                              )}
                              {dev.enabled && live?.en_rango == null && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
            {grupos.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Cree un grupo para programar alertas por correo.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Registro de envíos
              </CardTitle>
              <CardDescription>
                Cada umbral enviado queda registrado; no se repite hasta un nuevo episodio (vuelta a
                EN RANGO).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="mb-4" onClick={() => void refreshLogs()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Umbral</TableHead>
                    <TableHead>Destinatarios</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envioLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString('es-ES')}
                      </TableCell>
                      <TableCell>{log.grupoNombre}</TableCell>
                      <TableCell className="text-xs">
                        {log.descripcionEquipo}
                        <br />
                        <span className="text-muted-foreground">{log.imei}</span>
                      </TableCell>
                      <TableCell>{log.umbralHoras} h (~{log.horasFueraRango} h)</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        {log.destinatarios.join(', ')}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge className="bg-emerald-600">Enviado</Badge>
                        ) : (
                          <Badge variant="destructive" title={log.error}>
                            Error
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {envioLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sin envíos registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeGrupoDialog();
          else setDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditingExisting
                ? `Editar grupo: ${editing?.nombre || 'sin nombre'}`
                : 'Nuevo grupo de correo'}
            </DialogTitle>
            <DialogDescription>
              {isEditingExisting
                ? 'Modifique destinatarios, equipos, descripciones y umbrales. Guarde para aplicar los cambios.'
                : 'Defina destinatarios y agregue dispositivos buscando por IMEI o nombre.'}
            </DialogDescription>
          </DialogHeader>
          {editing != null && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre del grupo</Label>
                  <Input
                    value={editing.nombre}
                    onChange={(e) => setEditing({ ...editing, nombre: e.target.value })}
                    placeholder="Alertas IFF Perú"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (saludo en correo)</Label>
                  <Input
                    value={editing.cliente}
                    onChange={(e) => setEditing({ ...editing, cliente: e.target.value })}
                    placeholder="IFF"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Correos destinatarios</Label>
                <Input
                  value={emailsDraft}
                  onChange={(e) => setEmailsDraft(e.target.value)}
                  placeholder="correo1@empresa.com, correo2@…"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v })}
                />
                <Label>Grupo activo</Label>
              </div>

              <div className="border-t pt-4 space-y-3">
                <Label>Agregar equipos al grupo</Label>
                <p className="text-xs text-muted-foreground">
                  Escriba IMEI, código (TUNEL) o nombre para filtrar y seleccione el dispositivo.
                </p>
                {loading ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando listado de equipos…
                  </p>
                ) : dispositivos.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      No hay equipos cargados. Pulse «Equipos» arriba para actualizar telemetría.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadDevices()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Cargar equipos
                    </Button>
                  </div>
                ) : (
                  <DeviceSearchPicker
                    options={deviceSearchOptions}
                    onSelect={addDeviceToGrupo}
                    placeholder="Escriba IMEI, nombre o código (TUNEL)…"
                  />
                )}

                {editing.devices.length === 0 && (
                  <p className="text-sm text-muted-foreground border rounded-md p-4 text-center">
                    Aún no hay equipos en este grupo. Use el buscador para agregar dispositivos.
                  </p>
                )}

                {editing.devices.length > 0 && (
                  <Label className="text-sm">Equipos en el grupo ({editing.devices.length})</Label>
                )}

                {editing.devices.map((dev) => (
                  <Card key={dev.rowKey} className="p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-mono">
                        {dev.codigo} · {dev.imei}
                      </span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={dev.enabled}
                          onCheckedChange={(v) => updateDeviceInGrupo(dev.rowKey, { enabled: v })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              devices: editing.devices.filter((d) => d.rowKey !== dev.rowKey),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Tipo de evento</Label>
                      <Select
                        value={dev.tipoEvento ?? 'operaciones'}
                        onValueChange={(v) =>
                          updateDeviceInGrupo(dev.rowKey, {
                            tipoEvento: v as CorreoTipoEvento,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operaciones">Operaciones</SelectItem>
                          <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        Descripción / ID Reefer en correo (ej. ZGRU5295105). Vacío = nombre en
                        plataforma.
                      </Label>
                      <Input
                        value={dev.descripcionEquipo ?? ''}
                        onChange={(e) =>
                          updateDeviceInGrupo(dev.rowKey, { descripcionEquipo: e.target.value })
                        }
                        placeholder="ZGRU5295105"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Umbrales de aviso (horas fuera de rango)</Label>
                      <div className="flex flex-wrap gap-2">
                        {UMBRALES_HORAS_DISPONIBLES.map((h) => {
                          const checked = normalizeUmbrales(dev.umbralesHoras).includes(h);
                          return (
                            <label
                              key={h}
                              className="flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => toggleUmbral(dev.rowKey, h, v === true)}
                              />
                              {h}h
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeGrupoDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGrupo}>
              {isEditingExisting ? 'Guardar cambios' : 'Crear grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
