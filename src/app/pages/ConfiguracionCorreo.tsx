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
  fetchServerCiclos,
  sendTestEmailViaServer,
  clearCorreoHistorial,
  syncDeviceNamesToServer,
  fetchDeviceAlertState,
  saveDeviceAlertConfigApi,
  updateDeviceReferencia,
} from '../modules/correo/correoServerApi';
import {
  buildDeviceNamesForServer,
  enrichGrupoDevicesWithNames,
  nombrePlataformaForDevice,
} from '../modules/correo/deviceNamesSync';
import {
  computeRangoLimites,
  formatRangoTemperatura,
  toleranciaSetpointDefault,
  evaluarEstadoRangoListado,
} from '../modules/correo/rangoTemperatura';
import type {
  CorreoEnvioLog,
  CorreoServerStatus,
  CorreoCicloAnalisis,
  CicloEvaluacionDispositivo,
  SmtpConfigSaveInput,
  DeviceAlertStateEntry,
} from '../modules/correo/types';
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
  ClipboardList,
  Settings2,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function estadoCicloLabel(estado: CicloEvaluacionDispositivo['estado']): string {
  const map: Record<CicloEvaluacionDispositivo['estado'], string> = {
    normal: 'Normal',
    fuera_rango_sin_envio: 'Fuera de rango (sin envío)',
    correo_enviado: 'Correo enviado',
    equipo_apagado: 'Apagado (sin envío)',
    correo_apagado_enviado: 'Correo APAGADO enviado',
    error_envio: 'Error de envío',
    sin_telemetria: 'Sin telemetría',
    sin_dato_rango: 'Sin dato en_rango',
    equipo_off: 'Equipo off en grupo',
    grupo_inactivo: 'Grupo inactivo',
    grupo_sin_correos: 'Grupo sin correos',
  };
  return map[estado] ?? estado;
}

function estadoCicloBadgeClass(estado: CicloEvaluacionDispositivo['estado']): string {
  switch (estado) {
    case 'normal':
      return 'bg-emerald-600';
    case 'correo_enviado':
      return 'bg-blue-600';
    case 'correo_apagado_enviado':
      return 'bg-slate-700';
    case 'equipo_apagado':
      return 'bg-gray-600';
    case 'fuera_rango_sin_envio':
      return 'bg-amber-600';
    case 'error_envio':
      return 'bg-red-600';
    default:
      return 'bg-gray-500';
  }
}

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
  const [smtpPasswordSaved, setSmtpPasswordSaved] = useState(false);
  const [smtpUpdatedAt, setSmtpUpdatedAt] = useState<string | null>(null);
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
  const [ciclos, setCiclos] = useState<CorreoCicloAnalisis[]>([]);
  const [cicloDetalle, setCicloDetalle] = useState<CorreoCicloAnalisis | null>(null);
  const [limpiarOpen, setLimpiarOpen] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [limpiarOpts, setLimpiarOpts] = useState({
    envios: true,
    ciclos: true,
    incidentes: true,
    episodios: false,
  });
  const [alertState, setAlertState] = useState<DeviceAlertStateEntry[]>([]);
  const [alertEdit, setAlertEdit] = useState<DeviceAlertStateEntry | null>(null);
  const [alertMode, setAlertMode] = useState<'standard' | 'custom'>('standard');
  const [alertUmbrales, setAlertUmbrales] = useState<number[]>([...DEFAULT_UMBRALES_HORAS]);
  const [alertUseManualRef, setAlertUseManualRef] = useState(false);
  const [alertManualRef, setAlertManualRef] = useState('');
  const [alerta1Hora, setAlerta1Hora] = useState(false);
  const [useRangoPersonalizado, setUseRangoPersonalizado] = useState(false);
  const [margenInferior, setMargenInferior] = useState('0.5');
  const [margenSuperior, setMargenSuperior] = useState('0.5');
  const [alertSaving, setAlertSaving] = useState(false);
  const [traceRowKey, setTraceRowKey] = useState<string | null>(null);

  const localNames = useMemo(() => readDeviceLocalNames(), []);

  const loadServerConfig = useCallback(async () => {
    try {
      let g = await fetchServerGrupos();
      const localG = getGruposCorreo();
      const localS = readSmtpConfig();
      let smtpLoaded = await fetchServerSmtp();

      if (!smtpLoaded?.hasPassword && localS?.user && localS.appPassword) {
        smtpLoaded = await saveServerSmtp({
          user: localS.user,
          fromName: localS.fromName,
          appPassword: localS.appPassword,
        });
        toast.message('Remitente migrado a la base interna del servidor');
      } else if (g.length === 0 && (localG.length > 0 || localS)) {
        await migrateLocalCorreoToServer({ smtp: localS, grupos: localG });
        g = await fetchServerGrupos();
        smtpLoaded = await fetchServerSmtp();
        toast.message('Configuración local migrada al servidor');
      }

      setGrupos(g);
      if (smtpLoaded) {
        setSmtpUser(smtpLoaded.user);
        setSmtpFromName(smtpLoaded.fromName);
        setSmtpPasswordSaved(smtpLoaded.hasPassword);
        setSmtpUpdatedAt(smtpLoaded.updatedAt);
        setSmtpPass('');
      }
      setEnvioLogs(await fetchServerEnvios(80));
      setCiclos(await fetchServerCiclos(40));
      setServerStatus(await fetchCorreoStatus());
      const st = await fetchDeviceAlertState();
      setAlertState(st.entries);
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

  useEffect(() => {
    if (user == null || dispositivos.length === 0) return;
    void syncDeviceNamesToServer(
      buildDeviceNamesForServer(user, dispositivos, localNames)
    ).catch(() => {
      /* silencioso: el ciclo usará nombres ya guardados en grupos */
    });
  }, [user, dispositivos, localNames]);

  const refreshLogs = async () => {
    setEnvioLogs(await fetchServerEnvios(80));
    setCiclos(await fetchServerCiclos(40));
    setServerStatus(await fetchCorreoStatus());
    const st = await fetchDeviceAlertState();
    setAlertState(st.entries);
  };
  const refreshGrupos = async () => setGrupos(await fetchServerGrupos());

  const liveDeviceForRowKey = useCallback(
    (rowKey: string) => dispositivos.find((d) => deviceRowKey(d) === rowKey) ?? null,
    [dispositivos]
  );

  const openAlertEdit = (entry: DeviceAlertStateEntry) => {
    const cfg = entry.config;
    const live = liveDeviceForRowKey(entry.rowKey);
    const setPoint = live?.ultimo_dato?.set_point ?? null;
    const defaultMargen =
      setPoint != null && !Number.isNaN(setPoint) ? toleranciaSetpointDefault(setPoint) : 0.5;

    setAlertEdit(entry);
    setAlertMode(cfg?.mode === 'custom' ? 'custom' : 'standard');
    setAlerta1Hora(Boolean(cfg?.alerta1Hora));
    setAlertUmbrales(
      cfg?.mode === 'custom' && cfg.umbralesHoras?.length
        ? normalizeUmbrales(cfg.umbralesHoras)
        : [...DEFAULT_UMBRALES_HORAS]
    );
    setAlertUseManualRef(Boolean(cfg?.useReferenciaManual));
    setUseRangoPersonalizado(Boolean(cfg?.useRangoPersonalizado));
    setMargenInferior(String(cfg?.margenInferior ?? defaultMargen));
    setMargenSuperior(String(cfg?.margenSuperior ?? defaultMargen));
    if (cfg?.referenciaManual) {
      const d = new Date(cfg.referenciaManual);
      setAlertManualRef(
        Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16)
      );
    } else if (entry.episode?.since) {
      setAlertManualRef(new Date(entry.episode.since).toISOString().slice(0, 16));
    } else {
      setAlertManualRef('');
    }
  };

  const closeAlertEdit = () => {
    setAlertEdit(null);
    setAlertSaving(false);
  };

  const toggleAlertUmbral = (h: number, on: boolean) => {
    setAlertUmbrales((prev) => {
      const next = on ? [...prev, h] : prev.filter((x) => x !== h);
      return normalizeUmbrales(next.length ? next : [2]);
    });
  };

  const handleSaveAlertConfig = async () => {
    if (alertEdit == null) return;
    setAlertSaving(true);
    try {
      const margenInf = Number(margenInferior);
      const margenSup = Number(margenSuperior);
      if (useRangoPersonalizado && (Number.isNaN(margenInf) || Number.isNaN(margenSup))) {
        toast.error('Indique márgenes de temperatura válidos');
        setAlertSaving(false);
        return;
      }
      const payload = {
        mode: alertMode,
        alerta1Hora,
        useRangoPersonalizado,
        margenInferior: useRangoPersonalizado ? margenInf : undefined,
        margenSuperior: useRangoPersonalizado ? margenSup : undefined,
        ...(alertMode === 'custom'
          ? {
              umbralesHoras: alertUmbrales,
              useReferenciaManual: alertUseManualRef,
              referenciaManual:
                alertUseManualRef && alertManualRef
                  ? new Date(alertManualRef).toISOString()
                  : undefined,
            }
          : {}),
      } as const;

      await saveDeviceAlertConfigApi(alertEdit.rowKey, payload);

      if (alertMode === 'custom' && alertUseManualRef && alertManualRef) {
        await updateDeviceReferencia(alertEdit.rowKey, {
          action: 'manual',
          since: new Date(alertManualRef).toISOString(),
        });
      }

      const st = await fetchDeviceAlertState();
      setAlertState(st.entries);
      toast.success('Configuración de alerta guardada');
      closeAlertEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar configuración');
      setAlertSaving(false);
    }
  };

  const handleRefreshReferenciaHistorial = async () => {
    if (alertEdit == null) return;
    setAlertSaving(true);
    try {
      const result = await updateDeviceReferencia(alertEdit.rowKey, { action: 'historial' });
      const st = await fetchDeviceAlertState();
      setAlertState(st.entries);
      const updated = st.entries.find((e) => e.rowKey === alertEdit.rowKey);
      if (updated) openAlertEdit(updated);
      toast.success(result.criterio);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al re-analizar referencia');
    } finally {
      setAlertSaving(false);
    }
  };

  const traceEvaluaciones = useMemo(() => {
    if (traceRowKey == null) return [];
    const rows: Array<CicloEvaluacionDispositivo & { cicloAt: string; cicloId: string }> = [];
    for (const ciclo of ciclos) {
      for (const ev of ciclo.evaluaciones) {
        if (ev.rowKey === traceRowKey) {
          rows.push({ ...ev, cicloAt: ciclo.checkedAt, cicloId: ciclo.id });
        }
      }
    }
    return rows.slice(0, 80);
  }, [ciclos, traceRowKey]);

  const traceEntry = alertState.find((e) => e.rowKey === traceRowKey);

  const alertConfigByRowKey = useMemo(() => {
    const map: Record<string, DeviceAlertStateEntry['config']> = {};
    for (const e of alertState) map[e.rowKey] = e.config;
    return map;
  }, [alertState]);

  const smtpReadyOnServer = (): boolean =>
    Boolean(smtpUser.trim() && (smtpPasswordSaved || smtpPass.replace(/\s/g, '')));

  const handleLimpiarHistorial = async () => {
    if (!limpiarOpts.envios && !limpiarOpts.ciclos && !limpiarOpts.incidentes && !limpiarOpts.episodios) {
      toast.error('Seleccione al menos un tipo de historial a eliminar');
      return;
    }
    setLimpiando(true);
    try {
      const cleared = await clearCorreoHistorial(limpiarOpts);
      setLimpiarOpen(false);
      await refreshLogs();
      toast.success(`Historial eliminado: ${cleared.join(', ')}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al limpiar historial');
    } finally {
      setLimpiando(false);
    }
  };

  const buildSmtpSavePayload = (): SmtpConfigSaveInput | null => {
    const userVal = smtpUser.trim();
    if (!userVal) return null;
    const pass = smtpPass.replace(/\s/g, '');
    if (!pass && !smtpPasswordSaved) return null;
    return {
      user: userVal,
      fromName: smtpFromName.trim() || 'ZTRACK TELEMETRY',
      ...(pass ? { appPassword: pass } : {}),
    };
  };

  const handleSaveSmtp = async () => {
    const payload = buildSmtpSavePayload();
    if (payload == null) {
      toast.error('Indique correo Gmail. La clave es obligatoria solo la primera vez.');
      return;
    }
    try {
      const saved = await saveServerSmtp(payload);
      if (payload.appPassword) {
        persistSmtpConfig({
          user: saved.user,
          appPassword: payload.appPassword,
          fromName: saved.fromName,
        });
      }
      setSmtpPasswordSaved(saved.hasPassword);
      setSmtpUpdatedAt(saved.updatedAt);
      setSmtpPass('');
      setServerStatus(await fetchCorreoStatus());
      toast.success('Remitente guardado en la base interna del servidor');
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
      const devices = enrichGrupoDevicesWithNames(
        editing.devices,
        dispositivos,
        user,
        localNames
      );
      await saveServerGrupo({
        ...editing,
        devices,
        nombre: editing.nombre.trim(),
        cliente: editing.cliente.trim() || 'Cliente',
        emails,
        createdAt: editingCreatedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await syncDeviceNamesToServer(buildDeviceNamesForServer(user, dispositivos, localNames));
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
    const nombre = nombrePlataformaForDevice(user, d, localNames);
    setEditing({
      ...editing,
      devices: [
        ...editing.devices,
        {
          rowKey,
          imei: d.imei,
          codigo: d.codigo ?? '—',
          descripcionEquipo: '',
          nombrePlataforma: nombre !== SIN_ASIGNAR ? nombre : undefined,
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
      setCicloDetalle(result);
      if (result.emailsSent > 0) {
        toast.success(
          `${result.emailsSent} correo(s). ${result.resumen?.normal ?? 0} equipo(s) normal(es).`
        );
      } else if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else {
        toast.message(result.criterio ?? 'Ciclo completado. Revise el análisis por equipo.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en ciclo del servidor');
    } finally {
      setRunningNow(false);
    }
  };

  const handleSendGroupTest = async (grupo: GrupoCorreo) => {
    if (!smtpReadyOnServer() && !serverStatus?.smtpConfigured) {
      toast.error('Guarde el remitente Gmail en el servidor antes de enviar');
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
              {serverStatus.lastRun.criterio != null && serverStatus.lastRun.criterio !== '' && (
                <> · {serverStatus.lastRun.criterio}</>
              )}
              {serverStatus.lastRun.resumen != null && (
                <>
                  {' '}
                  · {serverStatus.lastRun.resumen.normal} normal(es) ·{' '}
                  {serverStatus.lastRun.resumen.correoEnviado} con correo
                </>
              )}
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
          <TabsTrigger value="alertas">Alertas por equipo</TabsTrigger>
          <TabsTrigger value="ciclos">Ciclos de análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="remitente" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Remitente principal (Gmail)
                {smtpPasswordSaved && (
                  <Badge className="bg-emerald-600">Guardado en servidor</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Persistido en la base interna del servidor. El sistema de alertas lo usa
                automáticamente; no hace falta volver a guardarlo en cada envío.
                {smtpUpdatedAt != null && (
                  <>
                    {' '}
                    Última modificación:{' '}
                    {new Date(smtpUpdatedAt).toLocaleString('es-ES')}.
                  </>
                )}
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
                <Label htmlFor="smtp-pass">Clave de aplicación Gmail</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={
                    smtpPasswordSaved
                      ? 'Dejar vacío para mantener la clave guardada'
                      : '16 caracteres — obligatoria la primera vez'
                  }
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
              Un grupo agrupa destinatarios y uno o más dispositivos. Si un equipo está fuera de
              rango, el servidor consulta las últimas 12 h para fijar la referencia. Solo se envía
              un correo por umbral alcanzado (a 12 h solo el de 12 h; el siguiente será a 13 h).
              Complete «Descripción / ID Reefer» en cada equipo para el asunto del correo.
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
                        const enRangoLive =
                          live != null
                            ? (() => {
                                const st = evaluarEstadoRangoListado(
                                  live,
                                  alertConfigByRowKey[dev.rowKey]
                                );
                                if (st === 'apagado') return 'apagado' as const;
                                if (st === 'normal') return true;
                                if (st === 'fuera') return false;
                                return null;
                              })()
                            : null;
                        return (
                          <TableRow key={dev.rowKey}>
                            <TableCell className="text-xs">
                              <div className="font-medium">
                                {dev.nombrePlataforma?.trim() ||
                                  (live
                                    ? nombrePlataformaForDevice(user, live, localNames)
                                    : null) ||
                                  'SIN ASIGNAR'}
                              </div>
                              <div className="text-muted-foreground font-mono">
                                {dev.codigo} · {dev.imei}
                              </div>
                            </TableCell>
                            <TableCell>
                              {dev.descripcionEquipo?.trim() || '(opcional Reefer ID)'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {dev.tipoEvento === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones'} ·{' '}
                              {normalizeUmbrales(dev.umbralesHoras).join(', ')} h
                            </TableCell>
                            <TableCell>
                              {!dev.enabled && <Badge variant="secondary">Off</Badge>}
                              {dev.enabled && enRangoLive === 'apagado' && (
                                <Badge className="bg-gray-700">APAGADO</Badge>
                              )}
                              {dev.enabled && enRangoLive === false && (
                                <Badge className="bg-red-600">FUERA DE RANGO</Badge>
                              )}
                              {dev.enabled && enRangoLive === true && (
                                <Badge className="bg-emerald-600">EN RANGO</Badge>
                              )}
                              {dev.enabled &&
                                enRangoLive !== true &&
                                enRangoLive !== false &&
                                enRangoLive !== 'apagado' && (
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
                Un solo correo por umbral alcanzado (ej. a las 12 h solo aviso de 12 h, no 2…11).
                Fechas en GMT-5. No se repite el mismo umbral hasta un nuevo episodio (vuelta EN
                RANGO).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={() => void refreshLogs()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setLimpiarOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpiar historial
                </Button>
              </div>
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
                        {new Date(log.sentAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
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

        <TabsContent value="alertas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Alertas por equipo
              </CardTitle>
              <CardDescription>
                Modo estándar: umbrales del grupo y referencia automática. Puede activar alerta a
                1 h y personalizar el rango de temperatura EN RANGO por equipo. Modo personalizado:
                override de umbrales y/o referencia manual. Un solo correo por umbral.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Rango EN RANGO</TableHead>
                    <TableHead>Alerta 1 h</TableHead>
                    <TableHead>Referencia activa</TableHead>
                    <TableHead>Umbrales enviados</TableHead>
                    <TableHead className="w-[200px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertState.map((entry) => {
                    const nombre =
                      entry.descripcionEquipo ||
                      entry.nombrePlataforma ||
                      entry.codigo ||
                      entry.imei;
                    const mode = entry.config?.mode === 'custom' ? 'personalizada' : 'estándar';
                    const live = liveDeviceForRowKey(entry.rowKey);
                    const setPoint = live?.ultimo_dato?.set_point ?? null;
                    const rangoTexto = formatRangoTemperatura(setPoint, entry.config);
                    return (
                      <TableRow key={entry.rowKey}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{nombre}</div>
                          <div className="text-muted-foreground">{entry.imei}</div>
                          <div className="text-muted-foreground">{entry.grupoNombre}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={mode === 'personalizada' ? 'default' : 'secondary'}>
                            {mode}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px]" title={rangoTexto}>
                          {rangoTexto}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.config?.alerta1Hora ? (
                            <Badge className="bg-blue-600">Activa</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.episode?.since ? (
                            <>
                              {new Date(entry.episode.since).toLocaleString('es-ES')}
                              {entry.episode.referenceLocked && (
                                <div className="text-muted-foreground">Referencia fija</div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin episodio activo</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.episode?.sentUmbrales?.length
                            ? `${entry.episode.sentUmbrales.join(', ')} h`
                            : '—'}
                        </TableCell>
                        <TableCell className="space-x-1">
                          <Button variant="outline" size="sm" onClick={() => openAlertEdit(entry)}>
                            Configurar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTraceRowKey(entry.rowKey)}
                          >
                            Trazabilidad
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {alertState.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No hay equipos en grupos de correo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ciclos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Ciclos de análisis
              </CardTitle>
              <CardDescription>
              Cada ciclo evalúa todos los equipos en grupos de correo. Fuera de rango sin
              referencia: consulta historial 12 h; con referencia: cuenta horas sin volver a
              consultar. EN RANGO: no consulta historial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead>Resumen</TableHead>
                    <TableHead>Criterio general</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ciclos.map((ciclo) => (
                    <TableRow key={ciclo.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(ciclo.checkedAt).toLocaleString('es-ES')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ciclo.trigger === 'manual' ? 'default' : 'secondary'}>
                          {ciclo.trigger === 'manual' ? 'Manual' : 'Automático'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {ciclo.devicesChecked} revisados · {ciclo.emailsSent} correo(s)
                      </TableCell>
                      <TableCell className="text-xs">
                        {ciclo.resumen != null ? (
                          <span>
                            {ciclo.resumen.normal} normal · {ciclo.resumen.fueraRangoSinEnvio}{' '}
                            fuera sin envío · {ciclo.resumen.correoEnviado} enviado
                            {ciclo.resumen.errores > 0 && (
                              <> · {ciclo.resumen.errores} error(es)</>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={ciclo.criterio}>
                        {ciclo.criterio ?? ciclo.skipped ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCicloDetalle(ciclo)}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {ciclos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Aún no hay ciclos registrados. Use «Ejecutar ahora» o espere el ciclo
                        automático.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={cicloDetalle != null} onOpenChange={(open) => !open && setCicloDetalle(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del ciclo de análisis</DialogTitle>
            <DialogDescription>
              {cicloDetalle != null && (
                <>
                  {new Date(cicloDetalle.checkedAt).toLocaleString('es-ES')} ·{' '}
                  {cicloDetalle.trigger === 'manual' ? 'Manual' : 'Automático'} ·{' '}
                  {cicloDetalle.devicesChecked} equipo(s) · {cicloDetalle.emailsSent} correo(s)
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {cicloDetalle != null && (
            <div className="space-y-4">
              {(cicloDetalle.criterio != null || cicloDetalle.skipped != null) && (
                <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">
                  {cicloDetalle.criterio ?? cicloDetalle.skipped}
                </p>
              )}
              {cicloDetalle.resumen != null && (
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-600">{cicloDetalle.resumen.normal} normal</Badge>
                  <Badge className="bg-amber-600">
                    {cicloDetalle.resumen.fueraRangoSinEnvio} fuera sin envío
                  </Badge>
                  <Badge className="bg-blue-600">
                    {cicloDetalle.resumen.correoEnviado} correo enviado
                  </Badge>
                  {cicloDetalle.resumen.sinTelemetria > 0 && (
                    <Badge variant="secondary">
                      {cicloDetalle.resumen.sinTelemetria} sin telemetría
                    </Badge>
                  )}
                  {cicloDetalle.resumen.errores > 0 && (
                    <Badge variant="destructive">{cicloDetalle.resumen.errores} error(es)</Badge>
                  )}
                </div>
              )}
              {cicloDetalle.errors.length > 0 && (
                <ul className="text-sm text-destructive list-disc pl-5">
                  {cicloDetalle.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Criterio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cicloDetalle.evaluaciones.map((ev) => (
                    <TableRow key={`${ev.grupoId}-${ev.rowKey}-${ev.estado}`}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{ev.descripcionEquipo || ev.codigo}</div>
                        <div className="text-muted-foreground">{ev.imei}</div>
                        {ev.referenciaDesde != null && (
                          <div className="text-muted-foreground">
                            Ref. desde {new Date(ev.referenciaDesde).toLocaleString('es-ES')}
                            {ev.consultaHistorial ? ' (historial 12 h)' : ' (referencia fija)'}
                          </div>
                        )}
                        {ev.configAlerta != null && (
                          <div className="text-muted-foreground">Config: {ev.configAlerta}</div>
                        )}
                        {ev.horasFueraHoy != null && ev.referenciaDesde != null && (
                          <div className="text-muted-foreground">
                            ~{ev.horasFueraHoy} h fuera desde referencia
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{ev.grupoNombre}</TableCell>
                      <TableCell>
                        <Badge className={estadoCicloBadgeClass(ev.estado)}>
                          {estadoCicloLabel(ev.estado)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[360px] whitespace-normal">
                        {ev.criterio}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cicloDetalle.evaluaciones.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sin evaluaciones en este ciclo
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCicloDetalle(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alertEdit != null} onOpenChange={(open) => !open && closeAlertEdit()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Configuración de alerta
            </DialogTitle>
            <DialogDescription>
              {alertEdit != null && (
                <>
                  {alertEdit.descripcionEquipo || alertEdit.nombrePlataforma || alertEdit.codigo} ·{' '}
                  {alertEdit.imei}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {alertEdit != null && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Modo de alerta</Label>
                <Select
                  value={alertMode}
                  onValueChange={(v) => setAlertMode(v as 'standard' | 'custom')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">
                      Estándar (umbrales del grupo + referencia automática)
                    </SelectItem>
                    <SelectItem value="custom">Personalizada (override por equipo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Switch checked={alerta1Hora} onCheckedChange={setAlerta1Hora} id="alerta-1h" />
                <Label htmlFor="alerta-1h" className="cursor-pointer">
                  Activar alerta a 1 hora fuera de rango
                </Label>
              </div>

              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="font-medium text-sm">Rango de temperatura EN RANGO</div>
                {(() => {
                  const live = liveDeviceForRowKey(alertEdit.rowKey);
                  const setPoint = live?.ultimo_dato?.set_point ?? null;
                  const draftCfg = {
                    mode: alertMode,
                    rowKey: alertEdit.rowKey,
                    useRangoPersonalizado,
                    margenInferior: Number(margenInferior) || 0.5,
                    margenSuperior: Number(margenSuperior) || 0.5,
                    alerta1Hora,
                  };
                  const rango = computeRangoLimites(setPoint, draftCfg);
                  const defaultMargen =
                    setPoint != null && !Number.isNaN(setPoint)
                      ? toleranciaSetpointDefault(setPoint)
                      : 0.5;
                  return (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Setpoint actual:{' '}
                        {setPoint != null && !Number.isNaN(setPoint)
                          ? `${setPoint.toFixed(1)} °C`
                          : '— (sin telemetría)'}
                        {rango != null && (
                          <>
                            {' '}
                            · Banda efectiva: {rango.min.toFixed(1)} … {rango.max.toFixed(1)} °C
                            {rango.personalizado ? ' (personalizada)' : ' (±10 % del setpoint)'}
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={useRangoPersonalizado}
                          onCheckedChange={(v) => {
                            setUseRangoPersonalizado(v);
                            if (v && setPoint != null && !Number.isNaN(setPoint)) {
                              const m = toleranciaSetpointDefault(setPoint);
                              setMargenInferior(String(m));
                              setMargenSuperior(String(m));
                            }
                          }}
                          id="rango-personalizado"
                        />
                        <Label htmlFor="rango-personalizado" className="cursor-pointer text-sm">
                          Personalizar márgenes (°C respecto al setpoint)
                        </Label>
                      </div>
                      {useRangoPersonalizado ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="margen-inf" className="text-xs">
                              Margen inferior (°C bajo SP)
                            </Label>
                            <Input
                              id="margen-inf"
                              type="number"
                              min={0}
                              step={0.1}
                              value={margenInferior}
                              onChange={(e) => setMargenInferior(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="margen-sup" className="text-xs">
                              Margen superior (°C sobre SP)
                            </Label>
                            <Input
                              id="margen-sup"
                              type="number"
                              min={0}
                              step={0.1}
                              value={margenSuperior}
                              onChange={(e) => setMargenSuperior(e.target.value)}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Por defecto: ±{defaultMargen.toFixed(2)} °C
                          {setPoint != null && !Number.isNaN(setPoint) ? ' (10 % del setpoint)' : ''}.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {alertMode === 'custom' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs">Umbrales personalizados (horas)</Label>
                    <div className="flex flex-wrap gap-2">
                      {UMBRALES_HORAS_DISPONIBLES.map((h) => (
                        <label
                          key={h}
                          className="flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer"
                        >
                          <Checkbox
                            checked={alertUmbrales.includes(h)}
                            onCheckedChange={(v) => toggleAlertUmbral(h, v === true)}
                          />
                          {h}h
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={alertUseManualRef}
                      onCheckedChange={setAlertUseManualRef}
                      id="use-manual-ref"
                    />
                    <Label htmlFor="use-manual-ref">Usar referencia manual fija</Label>
                  </div>

                  {alertUseManualRef && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-ref">Inicio fuera de rango (GMT-5, local)</Label>
                      <Input
                        id="manual-ref"
                        type="datetime-local"
                        value={alertManualRef}
                        onChange={(e) => setAlertManualRef(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
                <div className="font-medium">Estado actual del episodio</div>
                {alertEdit.episode?.since ? (
                  <>
                    <div>
                      Referencia: {new Date(alertEdit.episode.since).toLocaleString('es-ES')}
                      {alertEdit.episode.referenceLocked ? ' (fija)' : ''}
                    </div>
                    <div>
                      Umbrales ya enviados:{' '}
                      {alertEdit.episode.sentUmbrales?.length
                        ? `${alertEdit.episode.sentUmbrales.join(', ')} h`
                        : 'ninguno'}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">Sin episodio fuera de rango activo.</div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={alertSaving}
                  onClick={() => void handleRefreshReferenciaHistorial()}
                >
                  {alertSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Re-analizar referencia (12 h)
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeAlertEdit}>
              Cancelar
            </Button>
            <Button disabled={alertSaving} onClick={() => void handleSaveAlertConfig()}>
              {alertSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={traceRowKey != null} onOpenChange={(open) => !open && setTraceRowKey(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trazabilidad por ciclo</DialogTitle>
            <DialogDescription>
              {traceEntry != null && (
                <>
                  {traceEntry.descripcionEquipo || traceEntry.imei} — decisiones en los últimos
                  ciclos de análisis
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Criterio / decisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traceEvaluaciones.map((ev) => (
                <TableRow key={`${ev.cicloId}-${ev.grupoId}-${ev.estado}-${ev.cicloAt}`}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(ev.cicloAt).toLocaleString('es-ES')}
                  </TableCell>
                  <TableCell>
                    <Badge className={estadoCicloBadgeClass(ev.estado)}>
                      {estadoCicloLabel(ev.estado)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{ev.configAlerta ?? '—'}</TableCell>
                  <TableCell className="text-xs max-w-[420px] whitespace-normal">
                    {ev.criterio}
                  </TableCell>
                </TableRow>
              ))}
              {traceEvaluaciones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin evaluaciones registradas para este equipo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTraceRowKey(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      <div>
                        <span className="text-sm font-medium block">
                          {dev.nombrePlataforma?.trim() ||
                            (() => {
                              const live = dispositivos.find((d) => deviceRowKey(d) === dev.rowKey);
                              return live
                                ? nombrePlataformaForDevice(user, live, localNames)
                                : SIN_ASIGNAR;
                            })()}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {dev.codigo} · {dev.imei}
                        </span>
                      </div>
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
                        ID Reefer en correo (opcional, ej. ZGRU6645466). Si vacío se usa el nombre
                        del listado.
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

      <AlertDialog open={limpiarOpen} onOpenChange={setLimpiarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar historial de correo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Seleccione qué registros borrar del servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={limpiarOpts.envios}
                onCheckedChange={(v) => setLimpiarOpts((o) => ({ ...o, envios: v === true }))}
              />
              Registro de envíos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={limpiarOpts.ciclos}
                onCheckedChange={(v) => setLimpiarOpts((o) => ({ ...o, ciclos: v === true }))}
              />
              Ciclos de análisis
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={limpiarOpts.incidentes}
                onCheckedChange={(v) =>
                  setLimpiarOpts((o) => ({ ...o, incidentes: v === true }))
                }
              />
              Incidentes de correo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={limpiarOpts.episodios}
                onCheckedChange={(v) =>
                  setLimpiarOpts((o) => ({ ...o, episodios: v === true }))
                }
              />
              Referencias de episodios fuera de rango (state)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limpiando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={limpiando}
              onClick={(e) => {
                e.preventDefault();
                void handleLimpiarHistorial();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {limpiando ? 'Eliminando…' : 'Eliminar seleccionado'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
