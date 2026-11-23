import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import type { DispositivoUltimoEstado } from '../types';
import { useAuth } from '../AuthContext';
import {
  userMayAccessDispositivo,
  displayNameForDevice,
  userIsSuperAdmin,
  userMayAccessDataAt,
} from '../modules/usuario';
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
  userCanAccessCorreoConfig,
  userCanSeeCorreoRemitente,
  userCanSeeCorreoCiclos,
  countGruposOwnedByUser,
  maxEmailsForUser,
  maxGruposForUser,
  validateGrupoCorreoLimits,
  ADMIN_MAX_CORREO_GRUPOS,
  ADMIN_MAX_CORREO_EMAILS_POR_GRUPO,
  userMayAssignCorreoDevice,
} from '../modules/correo';
import {
  fetchCorreoStatus,
  fetchServerSmtp,
  saveServerSmtp,
  fetchApiAsistenciaEmails,
  saveApiAsistenciaEmails,
  fetchServerDrive,
  saveServerDrive,
  saveServerDriveFolder,
  previewCortesCampaña,
  crearCarpetasCampañaApi,
  deleteServerDrive,
  type CorteCampaña,
  type DriveConfigServerView,
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
  fetchDeviceEventos,
  fetchRangoPredeterminado,
  saveRangoPredeterminadoApi,
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
  aplicarRangoPredeterminado,
  RANGO_PREDETERMINADO_DEFAULT,
  type RangoPredeterminado,
} from '../modules/correo/rangoTemperatura';
import {
  formatUmbralAlerta,
  type CorreoEnvioLog,
  type CorreoServerStatus,
  type CorreoCicloAnalisis,
  type CicloEvaluacionDispositivo,
  type SmtpConfigSaveInput,
  type DeviceAlertStateEntry,
  type DeviceEventosView,
  type AlertEventoIntervalo,
} from '../modules/correo/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ReportesProgramadosPanel } from '../components/ReportesProgramadosPanel';
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
import { useT } from '../i18n';

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

function formatIntervaloEvento(iv: AlertEventoIntervalo): string {
  const desde = new Date(iv.since).toLocaleString('es-ES');
  const hasta = iv.until ? new Date(iv.until).toLocaleString('es-ES') : 'En curso';
  return `${desde} → ${hasta} (${iv.durationHours} h)`;
}

function emptyGrupo(ownerUsername?: string): Omit<GrupoCorreo, 'createdAt' | 'updatedAt'> {
  return {
    id: generateGrupoCorreoId(),
    nombre: '',
    cliente: '',
    emails: [],
    devices: [],
    enabled: true,
    whatsappActivo: false,
    whatsappNumeros: [],
    ownerUsername,
  };
}

export default function ConfiguracionCorreo() {
  const t = useT();
  const { user } = useAuth();
  const isSuper = userIsSuperAdmin(user);
  const canSeeRemitente = userCanSeeCorreoRemitente(user);
  const canSeeCiclos = userCanSeeCorreoCiclos(user);
  const maxEmails = maxEmailsForUser(user);
  const maxGrupos = maxGruposForUser(user);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpPasswordSaved, setSmtpPasswordSaved] = useState(false);
  const [smtpUpdatedAt, setSmtpUpdatedAt] = useState<string | null>(null);
  const [smtpFromName, setSmtpFromName] = useState('ZTRACK TELEMETRY');
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [apiAsistencia, setApiAsistencia] = useState('ztrack@zgroup.com.pe');
  const [sendingSmtpTest, setSendingSmtpTest] = useState(false);
  const [driveInfo, setDriveInfo] = useState<DriveConfigServerView | null>(null);
  const [driveUploading, setDriveUploading] = useState(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [campanaCliente, setCampanaCliente] = useState('');
  const [campanaDesde, setCampanaDesde] = useState('');
  const [campanaHasta, setCampanaHasta] = useState('');
  const [campanaCortes, setCampanaCortes] = useState<CorteCampaña[] | null>(null);
  const [campanaBusy, setCampanaBusy] = useState(false);
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
  const [emailInput, setEmailInput] = useState('');
  const [waNombre, setWaNombre] = useState('');
  const [waNumero, setWaNumero] = useState('');
  const [emailEditIndex, setEmailEditIndex] = useState<number | null>(null);
  const [emailEditValue, setEmailEditValue] = useState('');
  const [waEditIndex, setWaEditIndex] = useState<number | null>(null);
  const [waEditNombre, setWaEditNombre] = useState('');
  const [waEditNumero, setWaEditNumero] = useState('');
  const [busquedaGrupo, setBusquedaGrupo] = useState('');
  const [rangoPred, setRangoPred] = useState<RangoPredeterminado>({ ...RANGO_PREDETERMINADO_DEFAULT });
  const [rangoPredSaving, setRangoPredSaving] = useState(false);
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
  const [alerta30Minutos, setAlerta30Minutos] = useState(false);
  const [useRangoPersonalizado, setUseRangoPersonalizado] = useState(false);
  const [margenInferior, setMargenInferior] = useState('0.5');
  const [margenSuperior, setMargenSuperior] = useState('0.5');
  const [ignorarCobertura, setIgnorarCobertura] = useState(false);
  const [coberturaDesde, setCoberturaDesde] = useState('20:00');
  const [coberturaHasta, setCoberturaHasta] = useState('06:00');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertEventos, setAlertEventos] = useState<DeviceEventosView | null>(null);
  const [alertEventosLoading, setAlertEventosLoading] = useState(false);

  const localNames = useMemo(() => readDeviceLocalNames(), []);
  const actingUser = user?.username ?? null;

  const loadServerConfig = useCallback(async () => {
    if (!actingUser) return;
    try {
      let g = await fetchServerGrupos(actingUser);
      const localG = getGruposCorreo();
      const localS = readSmtpConfig();
      let smtpLoaded = canSeeRemitente
        ? await fetchServerSmtp(actingUser).catch(() => null)
        : null;

      if (
        canSeeRemitente &&
        !smtpLoaded?.hasPassword &&
        localS?.user &&
        localS.appPassword
      ) {
        smtpLoaded = await saveServerSmtp(
          {
            user: localS.user,
            fromName: localS.fromName,
            appPassword: localS.appPassword,
          },
          actingUser
        );
        toast.message('Remitente migrado a la base interna del servidor');
      } else if (g.length === 0 && (localG.length > 0 || (canSeeRemitente && localS))) {
        await migrateLocalCorreoToServer({
          smtp: canSeeRemitente ? localS : null,
          grupos: localG.map((x) => ({
            ...x,
            ownerUsername: x.ownerUsername ?? actingUser,
          })),
        });
        g = await fetchServerGrupos(actingUser);
        if (canSeeRemitente) smtpLoaded = await fetchServerSmtp(actingUser);
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
      if (canSeeCiclos) {
        setCiclos(await fetchServerCiclos(40, actingUser));
      } else {
        setCiclos([]);
      }
      if (canSeeRemitente) {
        const asistencia = await fetchApiAsistenciaEmails(actingUser).catch(() => null);
        if (asistencia && asistencia.length) setApiAsistencia(asistencia.join(', '));
        const drive = await fetchServerDrive(actingUser).catch(() => null);
        setDriveInfo(drive);
        setDriveFolderUrl(drive?.folderUrl ?? '');
      }
      const bandas = await fetchRangoPredeterminado().catch(() => null);
      if (bandas) setRangoPred(aplicarRangoPredeterminado(bandas));
      setServerStatus(await fetchCorreoStatus());
      const st = await fetchDeviceAlertState(actingUser);
      setAlertState(st.entries);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar config del servidor');
    }
  }, [actingUser, canSeeRemitente, canSeeCiclos]);

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
    if (canSeeCiclos && actingUser) {
      setCiclos(await fetchServerCiclos(40, actingUser));
    }
    setServerStatus(await fetchCorreoStatus());
    const st = await fetchDeviceAlertState(actingUser);
    setAlertState(st.entries);
  };
  const refreshGrupos = async () =>
    setGrupos(await fetchServerGrupos(actingUser));

  const alertStateVisible = useMemo(() => {
    if (isSuper) return alertState;
    const allowedKeys = new Set(
      grupos.flatMap((g) => (g.devices ?? []).map((d) => d.rowKey))
    );
    return alertState.filter((e) => allowedKeys.has(e.rowKey));
  }, [alertState, grupos, isSuper]);

  const envioLogsVisible = useMemo(() => {
    if (isSuper) return envioLogs;
    const allowedImeis = new Set(
      grupos.flatMap((g) => (g.devices ?? []).map((d) => d.imei))
    );
    const myEmails = new Set(
      grupos.flatMap((g) => (g.emails ?? []).map((e) => e.trim().toLowerCase()))
    );
    return envioLogs.filter((log) => {
      if (!allowedImeis.has(log.imei)) return false;
      if (!userMayAccessDataAt(user, log.imei, log.sentAt)) return false;
      const dest = (log.destinatarios ?? []).map((e) => e.trim().toLowerCase());
      if (dest.length && myEmails.size) {
        return dest.some((e) => myEmails.has(e));
      }
      return true;
    });
  }, [envioLogs, grupos, isSuper, user]);

  const liveDeviceForRowKey = useCallback(
    (rowKey: string) => dispositivos.find((d) => deviceRowKey(d) === rowKey) ?? null,
    [dispositivos]
  );

  const openAlertEdit = (entry: DeviceAlertStateEntry) => {
    const cfg = entry.config;
    const live = liveDeviceForRowKey(entry.rowKey);
    const setPoint = live?.ultimo_dato?.set_point ?? null;
    const defaultMargen = toleranciaSetpointDefault(setPoint ?? 0);

    setAlertEdit(entry);
    setAlertMode(cfg?.mode === 'custom' ? 'custom' : 'standard');
    setAlerta1Hora(Boolean(cfg?.alerta1Hora));
    setAlerta30Minutos(Boolean(cfg?.alerta30Minutos));
    setAlertEventos(null);
    setAlertEventosLoading(true);
    void fetchDeviceEventos(entry.rowKey)
      .then(setAlertEventos)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Error al cargar eventos del equipo');
      })
      .finally(() => setAlertEventosLoading(false));
    setAlertUmbrales(
      cfg?.mode === 'custom' && cfg.umbralesHoras?.length
        ? normalizeUmbrales(cfg.umbralesHoras)
        : [...DEFAULT_UMBRALES_HORAS]
    );
    setAlertUseManualRef(Boolean(cfg?.useReferenciaManual));
    setUseRangoPersonalizado(Boolean(cfg?.useRangoPersonalizado));
    setMargenInferior(String(cfg?.margenInferior ?? defaultMargen));
    setMargenSuperior(String(cfg?.margenSuperior ?? defaultMargen));
    setIgnorarCobertura(Boolean(cfg?.ignorarFueraLineaHorario));
    setCoberturaDesde(cfg?.coberturaDesde || '20:00');
    setCoberturaHasta(cfg?.coberturaHasta || '06:00');
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
    setAlertEventos(null);
    setAlertEventosLoading(false);
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
      if (ignorarCobertura && (!coberturaDesde || !coberturaHasta || coberturaDesde === coberturaHasta)) {
        toast.error('Indique una hora de inicio y una de fin distintas');
        setAlertSaving(false);
        return;
      }
      const payload = {
        mode: alertMode,
        alerta1Hora,
        alerta30Minutos,
        useRangoPersonalizado,
        margenInferior: useRangoPersonalizado ? margenInf : undefined,
        margenSuperior: useRangoPersonalizado ? margenSup : undefined,
        ignorarFueraLineaHorario: ignorarCobertura,
        coberturaDesde: ignorarCobertura ? coberturaDesde : undefined,
        coberturaHasta: ignorarCobertura ? coberturaHasta : undefined,
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

      await saveDeviceAlertConfigApi(alertEdit.rowKey, payload, actingUser);

      if (alertMode === 'custom' && alertUseManualRef && alertManualRef) {
        await updateDeviceReferencia(alertEdit.rowKey, {
          action: 'manual',
          since: new Date(alertManualRef).toISOString(),
        });
      }

      const st = await fetchDeviceAlertState(actingUser);
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
      const st = await fetchDeviceAlertState(actingUser);
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

  const alertTraceEvaluaciones = useMemo(() => {
    if (alertEdit == null) return [];
    const rows: Array<CicloEvaluacionDispositivo & { cicloAt: string; cicloId: string }> = [];
    for (const ciclo of ciclos) {
      for (const ev of ciclo.evaluaciones) {
        if (ev.rowKey === alertEdit.rowKey) {
          rows.push({ ...ev, cicloAt: ciclo.checkedAt, cicloId: ciclo.id });
        }
      }
    }
    return rows.slice(0, 80);
  }, [ciclos, alertEdit?.rowKey]);

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
    if (!canSeeRemitente) {
      toast.error('Solo superadmin puede configurar el remitente');
      return;
    }
    const payload = buildSmtpSavePayload();
    if (payload == null) {
      toast.error('Indique correo Gmail. La clave es obligatoria solo la primera vez.');
      return;
    }
    try {
      const saved = await saveServerSmtp(payload, actingUser);
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

  const handleSaveApiAsistencia = async () => {
    if (!canSeeRemitente) {
      toast.error('Solo superadmin puede configurar estos correos');
      return;
    }
    const emails = parseEmailList(apiAsistencia);
    if (emails.length === 0) {
      toast.error('Indique al menos un correo. Por defecto queda ztrack@zgroup.com.pe');
      return;
    }
    try {
      const saved = await saveApiAsistenciaEmails(emails, actingUser);
      setApiAsistencia(saved.join(', '));
      toast.success('Correos de asistencia de API guardados');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar los correos');
    }
  };

  const handleSendSmtpTest = async () => {
    const to = smtpTestTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error('Indique un correo de destino para la prueba');
      return;
    }
    const payload = buildSmtpSavePayload();
    if (payload == null) {
      toast.error('Indique el Gmail remitente y la clave de 16 caracteres');
      return;
    }
    setSendingSmtpTest(true);
    try {
      const saved = await saveServerSmtp(payload, actingUser);
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
      await sendTestEmailViaServer({
        to: [to],
        subject: 'ZTRACK — prueba de remitente',
        text: 'El remitente SMTP quedó configurado. Los avisos de informes pueden salir desde esta cuenta.',
      });
      setServerStatus(await fetchCorreoStatus());
      toast.success(`Prueba enviada a ${to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la prueba');
    } finally {
      setSendingSmtpTest(false);
    }
  };

  const handleDriveFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 100_000) {
      toast.error('El JSON de la cuenta de servicio es demasiado grande');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('Ese archivo no es JSON');
      return;
    }
    setDriveUploading(true);
    try {
      const saved = await saveServerDrive(parsed, actingUser);
      setDriveInfo(saved);
      setDriveFolderUrl(saved.folderUrl ?? '');
      toast.success(`Drive enlazado con ${saved.clientEmail}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la cuenta de Drive');
    } finally {
      setDriveUploading(false);
    }
  };

  const handleDriveClear = async () => {
    if (!window.confirm('¿Quitar la cuenta de servicio de Drive del servidor?')) return;
    setDriveUploading(true);
    try {
      setDriveInfo(await deleteServerDrive(actingUser));
      setDriveFolderUrl('');
      setCampanaCortes(null);
      toast.success('Cuenta de Drive quitada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo quitar la cuenta de Drive');
    } finally {
      setDriveUploading(false);
    }
  };

  const handleSaveDriveFolder = async () => {
    setDriveUploading(true);
    try {
      const saved = await saveServerDriveFolder(driveFolderUrl, actingUser);
      setDriveInfo(saved);
      setDriveFolderUrl(saved.folderUrl ?? '');
      toast.success('Carpeta general guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la carpeta');
    } finally {
      setDriveUploading(false);
    }
  };

  const handleVerCortes = async (crear: boolean) => {
    setCampanaBusy(true);
    try {
      const input = {
        cliente: campanaCliente,
        desde: campanaDesde,
        hasta: campanaHasta,
      };
      const cortes = crear
        ? (await crearCarpetasCampañaApi(input, actingUser)).cortes
        : await previewCortesCampaña(input, actingUser);
      setCampanaCortes(cortes);
      if (!crear) {
        toast.success('Orden de carpetas listo');
      } else {
        const nuevas = cortes.filter((c) => !c.existia).length;
        toast.success(
          nuevas === 0
            ? 'Esas carpetas ya existían. No se crearon de nuevo.'
            : `Carpetas listas. ${nuevas} nueva(s); el resto ya estaba.`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo armar el orden de la campaña');
    } finally {
      setCampanaBusy(false);
    }
  };

  const closeGrupoDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setEditingCreatedAt(undefined);
    setIsEditingExisting(false);
    setEmailInput('');
    setEmailEditIndex(null);
    setWaEditIndex(null);
    setBusquedaGrupo('');
  };

  const openNewGrupo = () => {
    const owned = countGruposOwnedByUser(user, grupos);
    if (maxGrupos != null && owned >= maxGrupos) {
      toast.error(`Como admin solo puede crear hasta ${maxGrupos} grupos de correo`);
      return;
    }
    setEditing(emptyGrupo(actingUser ?? undefined));
    setEditingCreatedAt(undefined);
    setIsEditingExisting(false);
    setEmailInput('');
    setEmailEditIndex(null);
    setWaEditIndex(null);
    setBusquedaGrupo('');
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
      whatsappActivo: g.whatsappActivo === true,
      whatsappNumeros: Array.isArray(g.whatsappNumeros) ? g.whatsappNumeros.map((n) => ({ ...n })) : [],
      ownerUsername: g.ownerUsername ?? actingUser ?? undefined,
    });
    setEditingCreatedAt(g.createdAt);
    setIsEditingExisting(true);
    setEmailInput('');
    setEmailEditIndex(null);
    setWaEditIndex(null);
    setBusquedaGrupo('');
    setDialogOpen(true);
    if (dispositivos.length === 0 && !loading) void loadDevices();
  };

  const correoValido = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const agregarCorreos = () => {
    if (editing == null) return;
    const incoming = parseEmailList(emailInput);
    if (incoming.length === 0) {
      toast.error('Escriba un correo, o varios separados por coma');
      return;
    }
    const invalido = incoming.find((e) => !correoValido(e));
    if (invalido) {
      toast.error(`Correo no válido: ${invalido}`);
      return;
    }
    const actuales = new Set(editing.emails.map((e) => e.toLowerCase()));
    const nuevos = incoming.filter((e) => !actuales.has(e.toLowerCase()));
    if (nuevos.length === 0) {
      toast.message('Esos correos ya están en el grupo');
      setEmailInput('');
      return;
    }
    const next = [...editing.emails, ...nuevos];
    if (maxEmails != null && next.length > maxEmails) {
      toast.error(`Como admin solo puede indicar hasta ${maxEmails} correos`);
      return;
    }
    setEditing({ ...editing, emails: next });
    setEmailInput('');
  };

  const guardarEdicionCorreo = () => {
    if (editing == null || emailEditIndex == null) return;
    const value = emailEditValue.trim();
    if (!correoValido(value)) {
      toast.error('Correo no válido');
      return;
    }
    const repetido = editing.emails.some(
      (e, i) => i !== emailEditIndex && e.toLowerCase() === value.toLowerCase()
    );
    if (repetido) {
      toast.error('Ese correo ya está en el grupo');
      return;
    }
    setEditing({
      ...editing,
      emails: editing.emails.map((e, i) => (i === emailEditIndex ? value : e)),
    });
    setEmailEditIndex(null);
  };

  const telefonoWhatsappValido = (telefono: string) =>
    (telefono.length === 9 && telefono.startsWith('9')) ||
    (telefono.length === 11 && telefono.startsWith('51'));

  const guardarEdicionWhatsapp = () => {
    if (editing == null || waEditIndex == null) return;
    const nombre = waEditNombre.trim();
    const crudo = waEditNumero.replace(/\D/g, '');
    if (!nombre) {
      toast.error('Escriba el nombre de quien recibe el WhatsApp');
      return;
    }
    if (!telefonoWhatsappValido(crudo)) {
      toast.error('El número debe ser de 9 dígitos, empezando por 9');
      return;
    }
    const normal = crudo.length === 9 ? `51${crudo}` : crudo;
    const repetido = (editing.whatsappNumeros ?? []).some(
      (n, i) => i !== waEditIndex && n.telefono === normal
    );
    if (repetido) {
      toast.error('Ese número ya está en el grupo');
      return;
    }
    setEditing({
      ...editing,
      whatsappNumeros: (editing.whatsappNumeros ?? []).map((n, i) =>
        i === waEditIndex ? { nombre, telefono: normal } : n
      ),
    });
    setWaEditIndex(null);
  };

  const nombreDeEquipoGrupo = (dev: GrupoCorreoDevice) => {
    const live = dispositivos.find((d) => deviceRowKey(d) === dev.rowKey);
    if (live) {
      const nombre = nombrePlataformaForDevice(user, live, localNames);
      if (nombre && nombre !== SIN_ASIGNAR) return nombre;
    }
    return dev.nombrePlataforma?.trim() || SIN_ASIGNAR;
  };

  const guardarRangoPredeterminado = async () => {
    setRangoPredSaving(true);
    try {
      const saved = await saveRangoPredeterminadoApi(rangoPred, actingUser);
      setRangoPred(aplicarRangoPredeterminado(saved));
      toast.success('Rango predefinido guardado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el rango');
    } finally {
      setRangoPredSaving(false);
    }
  };

  const handleSaveGrupo = async () => {
    if (editing == null) return;
    if (!editing.nombre.trim()) {
      toast.error('El nombre del grupo es obligatorio');
      return;
    }
    const pendientes = parseEmailList(emailInput);
    const invalido = pendientes.find((e) => !correoValido(e));
    if (invalido) {
      toast.error(`Correo no válido: ${invalido}`);
      return;
    }
    const emails = [
      ...editing.emails,
      ...pendientes.filter(
        (e) => !editing.emails.some((a) => a.toLowerCase() === e.toLowerCase())
      ),
    ];
    if (emails.length === 0) {
      toast.error('Indique al menos un correo destinatario');
      return;
    }
    const limitErr = validateGrupoCorreoLimits(user, {
      emails,
      devices: editing.devices,
      isNew: !isEditingExisting,
      ownedCount: countGruposOwnedByUser(user, grupos),
    });
    if (limitErr) {
      toast.error(limitErr);
      return;
    }
    try {
      const devices = enrichGrupoDevicesWithNames(
        editing.devices,
        dispositivos,
        user,
        localNames
      );
      await saveServerGrupo(
        {
          ...editing,
          devices,
          nombre: editing.nombre.trim(),
          cliente: editing.cliente.trim() || 'Cliente',
          emails,
          ownerUsername: editing.ownerUsername ?? actingUser ?? undefined,
          createdAt: editingCreatedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        actingUser
      );
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
      await deleteServerGrupo(id, actingUser);
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
    if (!userMayAssignCorreoDevice(user, { imei: d.imei, codigo: d.codigo ?? undefined })) {
      toast.error('Solo puede asignar equipos disponibles en su cuenta');
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

  if (!userCanAccessCorreoConfig(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8 text-blue-600" />
            {t('correo.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSuper
              ? 'Superadmin: remitente, grupos ilimitados y ciclos de análisis.'
              : `Admin: hasta ${ADMIN_MAX_CORREO_GRUPOS} grupos y ${ADMIN_MAX_CORREO_EMAILS_POR_GRUPO} correos por grupo; solo equipos disponibles.`}{' '}
            El envío corre automáticamente cada {ALERT_POLL_INTERVAL_MS / 60000} minutos.
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
          {canSeeRemitente && <TabsTrigger value="remitente">Remitente</TabsTrigger>}
          {canSeeRemitente && <TabsTrigger value="drive">Drive</TabsTrigger>}
          <TabsTrigger value="grupos">Grupos de correo</TabsTrigger>
          <TabsTrigger value="reportes">Reportes programados</TabsTrigger>
          <TabsTrigger value="log">Registro de envíos</TabsTrigger>
          <TabsTrigger value="alertas">Alertas por equipo</TabsTrigger>
          {canSeeCiclos && <TabsTrigger value="ciclos">Ciclos de análisis</TabsTrigger>}
        </TabsList>

        {canSeeRemitente && (
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="api-asistencia">
                  API sin conexión — asistencia técnica
                </Label>
                <Input
                  id="api-asistencia"
                  value={apiAsistencia}
                  onChange={(e) => setApiAsistencia(e.target.value)}
                  placeholder="ztrack@zgroup.com.pe, otro@zgroup.com.pe"
                />
                <p className="text-xs text-muted-foreground">
                  Si un enlace deja de entregar datos y todos sus equipos quedan fuera de
                  línea más de 3 horas, el aviso va solo a estos correos, cada hora. No se
                  envía al cliente: se presume una falla de la API. Separe varios correos
                  con coma.
                </p>
                <Button variant="secondary" onClick={() => void handleSaveApiAsistencia()}>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar correos de API
                </Button>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="smtp-test-to">Correo de prueba</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="smtp-test-to"
                    type="email"
                    className="max-w-md"
                    value={smtpTestTo}
                    onChange={(e) => setSmtpTestTo(e.target.value)}
                    placeholder="destino@empresa.com"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void handleSendSmtpTest()}
                    disabled={sendingSmtpTest}
                  >
                    {sendingSmtpTest ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Enviar prueba
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Guarda el remitente y manda un aviso corto a ese correo. La clave de 16
                  caracteres se escribe arriba; no hace falta un grupo de equipos.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {canSeeRemitente && (
        <TabsContent value="drive" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Cuenta de servicio de Drive
                {driveInfo?.configured && (
                  <Badge className="bg-emerald-600">Enlazada</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Suba el JSON descargado de Google Cloud. Queda en el servidor, en el mismo
                volumen que el remitente. La clave privada no se muestra ni se guarda en el
                navegador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {driveInfo?.configured ? (
                <div className="text-sm space-y-1">
                  <p>
                    Cuenta: <span className="font-medium">{driveInfo.clientEmail}</span>
                  </p>
                  <p>
                    Proyecto: <span className="font-medium">{driveInfo.projectId}</span>
                  </p>
                  {driveInfo.updatedAt && (
                    <p className="text-muted-foreground">
                      Actualizada el {new Date(driveInfo.updatedAt).toLocaleString('es-ES')}.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay una cuenta de servicio. Elija el archivo .json de la clave.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="application/json,.json"
                  className="max-w-md"
                  disabled={driveUploading}
                  onChange={(e) => {
                    const input = e.currentTarget;
                    void handleDriveFile(input.files?.[0] ?? null).finally(() => {
                      input.value = '';
                    });
                  }}
                />
                {driveInfo?.configured && (
                  <Button
                    variant="outline"
                    disabled={driveUploading}
                    onClick={() => void handleDriveClear()}
                  >
                    Quitar
                  </Button>
                )}
              </div>
              {driveInfo?.configured && (
                <div className="space-y-3 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="drive-folder">Carpeta general de la unidad compartida</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id="drive-folder"
                        className="max-w-xl"
                        value={driveFolderUrl}
                        onChange={(e) => setDriveFolderUrl(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/…"
                      />
                      <Button
                        variant="secondary"
                        disabled={driveUploading}
                        onClick={() => void handleSaveDriveFolder()}
                      >
                        Guardar carpeta
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Es el enlace raíz. Cada campaña crea debajo la carpeta del cliente, luego
                      MES_AÑO y dentro SEMANA_n. Una semana de lunes a domingo que cruza de mes
                      se parte: los días de cada mes van a su propia semana.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="campana-cliente">Cliente</Label>
                      <Input
                        id="campana-cliente"
                        value={campanaCliente}
                        onChange={(e) => setCampanaCliente(e.target.value)}
                        placeholder="DONOFRIO"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campana-desde">Desde</Label>
                      <Input
                        id="campana-desde"
                        type="date"
                        value={campanaDesde}
                        onChange={(e) => setCampanaDesde(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campana-hasta">Hasta</Label>
                      <Input
                        id="campana-hasta"
                        type="date"
                        value={campanaHasta}
                        onChange={(e) => setCampanaHasta(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={campanaBusy}
                      onClick={() => void handleVerCortes(false)}
                    >
                      Ver orden
                    </Button>
                    <Button
                      disabled={campanaBusy || !driveInfo.folderId}
                      onClick={() => void handleVerCortes(true)}
                    >
                      {campanaBusy ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Crear carpetas
                    </Button>
                  </div>
                  {campanaCortes && (
                    <ul className="text-sm space-y-1">
                      {campanaCortes.map((c) => (
                        <li key={c.ruta + c.desde}>
                          {c.carpetaUrl ? (
                            <a className="underline" href={c.carpetaUrl} target="_blank" rel="noreferrer">
                              {c.ruta}
                            </a>
                          ) : (
                            <span className="font-medium">{c.ruta}</span>
                          )}{' '}
                          <span className="text-muted-foreground">
                            {c.desde} a {c.hasta}
                            {c.existia ? ' · ya existía' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="grupos" className="mt-4 space-y-4">
          <div className="flex justify-between items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {isSuper
                ? 'Grupos ilimitados y destinatarios ilimitados. Asigne cualquier equipo.'
                : `Máximo ${ADMIN_MAX_CORREO_GRUPOS} grupos y ${ADMIN_MAX_CORREO_EMAILS_POR_GRUPO} correos por grupo. Solo equipos disponibles en su cuenta.`}{' '}
              Complete «Descripción / ID Reefer» en cada equipo para el asunto del correo.
              {!isSuper && (
                <>
                  {' '}
                  ({grupos.length}/{ADMIN_MAX_CORREO_GRUPOS} grupos)
                </>
              )}
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
                        {g.whatsappActivo && (g.whatsappNumeros?.length ?? 0) > 0
                          ? ` · WhatsApp: ${g.whatsappNumeros!.map((n) => n.nombre).join(', ')}`
                          : ''}
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
                                {(() => {
                                  const vivo = live
                                    ? nombrePlataformaForDevice(user, live, localNames)
                                    : '';
                                  if (vivo && vivo !== SIN_ASIGNAR) return vivo;
                                  return dev.nombrePlataforma?.trim() || 'SIN ASIGNAR';
                                })()}
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

        <TabsContent value="reportes" className="mt-4">
          <ReportesProgramadosPanel />
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
                  {envioLogsVisible.map((log) => (
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
                  {envioLogsVisible.length === 0 && (
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
                {isSuper
                  ? 'Configuración de alertas de todos los equipos en grupos de correo.'
                  : 'Solo equipos de sus grupos / asignados a su cuenta.'}{' '}
                Modo estándar: umbrales del grupo. Puede activar alertas a 30 min / 1 h.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isSuper && (
                <div className="space-y-3 rounded-md border p-3">
                  <div>
                    <div className="font-medium text-sm">Rango normal según setpoint</div>
                    <p className="text-xs text-muted-foreground">
                      Al abrir un equipo, el rango predefinido sale de estas bandas. Después se puede
                      personalizar en ese equipo.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">De este valor o más frío</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={rangoPred.frioHasta}
                        onChange={(e) => setRangoPred({ ...rangoPred, frioHasta: Number(e.target.value) })}
                      />
                      <Label className="text-xs">Margen ±</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={rangoPred.frioMargen}
                        onChange={(e) => setRangoPred({ ...rangoPred, frioMargen: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hasta antes de</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={rangoPred.medioHasta}
                        onChange={(e) => setRangoPred({ ...rangoPred, medioHasta: Number(e.target.value) })}
                      />
                      <Label className="text-xs">Margen ±</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={rangoPred.medioMargen}
                        onChange={(e) => setRangoPred({ ...rangoPred, medioMargen: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hasta antes de</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={rangoPred.templadoHasta}
                        onChange={(e) =>
                          setRangoPred({ ...rangoPred, templadoHasta: Number(e.target.value) })
                        }
                      />
                      <Label className="text-xs">Margen ±</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={rangoPred.templadoMargen}
                        onChange={(e) =>
                          setRangoPred({ ...rangoPred, templadoMargen: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Desde el último corte</Label>
                      <Input value="en adelante" disabled />
                      <Label className="text-xs">Margen ±</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={rangoPred.calidoMargen}
                        onChange={(e) =>
                          setRangoPred({ ...rangoPred, calidoMargen: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Con los valores de ahora: setpoint de {rangoPred.frioHasta} o más frío, ±
                    {rangoPred.frioMargen}. Mayor que {rangoPred.frioHasta} y menor que {rangoPred.medioHasta},
                    ±{rangoPred.medioMargen}. Desde {rangoPred.medioHasta} y menor que {rangoPred.templadoHasta},
                    ±{rangoPred.templadoMargen}. Desde {rangoPred.templadoHasta}, ±{rangoPred.calidoMargen}.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={rangoPredSaving}
                    onClick={() => void guardarRangoPredeterminado()}
                  >
                    {rangoPredSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar rangos'}
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Rango EN RANGO</TableHead>
                    <TableHead>Alertas tempranas</TableHead>
                    <TableHead>Episodio activo</TableHead>
                    <TableHead>Umbrales enviados</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertStateVisible.map((entry) => {
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
                          <div className="flex flex-wrap gap-1">
                            {entry.config?.alerta30Minutos && (
                              <Badge className="bg-violet-600">30 min</Badge>
                            )}
                            {entry.config?.alerta1Hora && (
                              <Badge className="bg-blue-600">1 h</Badge>
                            )}
                            {!entry.config?.alerta30Minutos && !entry.config?.alerta1Hora && (
                              <span className="text-muted-foreground">No</span>
                            )}
                            {entry.config?.ignorarFueraLineaHorario &&
                              entry.config.coberturaDesde &&
                              entry.config.coberturaHasta && (
                                <Badge variant="outline">
                                  Sin señal {entry.config.coberturaDesde}–{entry.config.coberturaHasta}
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.episode?.since ? (
                            <>
                              <Badge
                                variant={
                                  entry.episode.kind === 'apagado' ? 'secondary' : 'destructive'
                                }
                                className="mb-1"
                              >
                                {entry.episode.kind === 'apagado' ? 'Apagado' : 'Fuera de rango'}
                              </Badge>
                              <div>{new Date(entry.episode.since).toLocaleString('es-ES')}</div>
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
                            ? entry.episode.sentUmbrales.map(formatUmbralAlerta).join(', ')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => openAlertEdit(entry)}>
                            Configurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {alertStateVisible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No hay equipos en grupos de correo visibles para su cuenta.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canSeeCiclos && (
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
        )}
      </Tabs>

      {canSeeCiclos && (
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
      )}

      <Dialog open={alertEdit != null} onOpenChange={(open) => !open && closeAlertEdit()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                <Switch
                  checked={alerta30Minutos}
                  onCheckedChange={setAlerta30Minutos}
                  id="alerta-30m"
                />
                <Label htmlFor="alerta-30m" className="cursor-pointer">
                  Activar alerta a 30 minutos fuera de rango / apagado
                </Label>
              </div>

              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Switch checked={alerta1Hora} onCheckedChange={setAlerta1Hora} id="alerta-1h" />
                <Label htmlFor="alerta-1h" className="cursor-pointer">
                  Activar alerta a 1 hora fuera de rango / apagado
                </Label>
              </div>

              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={ignorarCobertura}
                    onCheckedChange={setIgnorarCobertura}
                    id="cobertura-horaria"
                  />
                  <Label htmlFor="cobertura-horaria" className="cursor-pointer">
                    Ignorar fuera de línea por horario de cobertura
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  En zonas donde la señal se corta por horas, por ejemplo de 20:00 a 06:00, el cliente
                  no recibe esa alerta. El conteo empieza a la hora en que vuelve la cobertura y el
                  correo sale 2 horas después. El administrador que recibe las fallas de API recibe,
                  cada hora, la lista de estos equipos.
                </p>
                {ignorarCobertura && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="cobertura-desde" className="text-xs">
                        Sin señal desde
                      </Label>
                      <Input
                        id="cobertura-desde"
                        type="time"
                        value={coberturaDesde}
                        onChange={(e) => setCoberturaDesde(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cobertura-hasta" className="text-xs">
                        Vuelve la cobertura
                      </Label>
                      <Input
                        id="cobertura-hasta"
                        type="time"
                        value={coberturaHasta}
                        onChange={(e) => setCoberturaHasta(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Con {coberturaDesde || '—'} a {coberturaHasta || '—'}, el primer correo al cliente
                      saldría 2 horas después de {coberturaHasta || 'esa hora'}.
                    </p>
                  </div>
                )}
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
                    alerta30Minutos,
                  };
                  const rango = computeRangoLimites(setPoint, draftCfg);
                  const defaultMargen = toleranciaSetpointDefault(setPoint ?? 0);
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
                            {rango.personalizado
                              ? ' (personalizada)'
                              : ` (±${defaultMargen} °C del setpoint)`}
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
                          Por defecto: ±{defaultMargen.toFixed(1)} °C del setpoint.
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
                      Tipo:{' '}
                      {alertEdit.episode.kind === 'apagado' ? 'Apagado' : 'Fuera de rango'} ·
                      Referencia: {new Date(alertEdit.episode.since).toLocaleString('es-ES')}
                      {alertEdit.episode.referenceLocked ? ' (fija)' : ''}
                    </div>
                    <div>
                      Umbrales ya enviados:{' '}
                      {alertEdit.episode.sentUmbrales?.length
                        ? alertEdit.episode.sentUmbrales.map(formatUmbralAlerta).join(', ')
                        : 'ninguno'}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">Sin episodio activo.</div>
                )}
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="font-medium text-sm">Rangos de evento (historial 12 h)</div>
                {alertEventosLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizando telemetría…
                  </div>
                ) : alertEventos != null ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium mb-2 text-red-700">
                        Fuera de rango (return_air)
                      </div>
                      {alertEventos.intervalosFueraRango.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin intervalos en 12 h.</p>
                      ) : (
                        <ul className="text-xs space-y-1 max-h-[140px] overflow-y-auto">
                          {alertEventos.intervalosFueraRango.map((iv, i) => (
                            <li key={`fdr-${i}`} className="border-l-2 border-red-300 pl-2">
                              {formatIntervaloEvento(iv)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-medium mb-2 text-slate-700">
                        Apagado (power_state 0)
                      </div>
                      {alertEventos.intervalosApagado.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin intervalos en 12 h.</p>
                      ) : (
                        <ul className="text-xs space-y-1 max-h-[140px] overflow-y-auto">
                          {alertEventos.intervalosApagado.map((iv, i) => (
                            <li key={`off-${i}`} className="border-l-2 border-slate-400 pl-2">
                              {formatIntervaloEvento(iv)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No se pudieron cargar los eventos.</p>
                )}
                {alertEventos != null && (
                  <p className="text-xs text-muted-foreground">
                    {alertEventos.historialPuntos} puntos · consultado{' '}
                    {new Date(alertEventos.consultadoAt).toLocaleString('es-ES')}
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="font-medium text-sm">Trazabilidad por ciclo</div>
                <div className="max-h-[220px] overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ciclo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Criterio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertTraceEvaluaciones.map((ev) => (
                        <TableRow key={`${ev.cicloId}-${ev.estado}-${ev.cicloAt}`}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(ev.cicloAt).toLocaleString('es-ES')}
                          </TableCell>
                          <TableCell>
                            <Badge className={estadoCicloBadgeClass(ev.estado)}>
                              {estadoCicloLabel(ev.estado)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs whitespace-normal max-w-[360px]">
                            {ev.criterio}
                          </TableCell>
                        </TableRow>
                      ))}
                      {alertTraceEvaluaciones.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-xs">
                            Sin evaluaciones registradas.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeGrupoDialog();
          else setDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-6xl w-[min(96vw,72rem)] max-h-[92vh] overflow-y-auto">
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
                    placeholder="Nombre del cliente"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  Correos destinatarios
                  {maxEmails != null && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      (máx. {maxEmails})
                    </span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarCorreos();
                      }
                    }}
                    placeholder="correo@empresa.com o varios separados por coma"
                  />
                  <Button type="button" variant="secondary" onClick={agregarCorreos}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pegue varios correos separados por coma, o agréguelos de uno en uno. Luego puede
                  editarlos o quitarlos.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={editing.whatsappActivo === true}
                    onChange={(e) => setEditing({ ...editing, whatsappActivo: e.target.checked })}
                  />
                  <span>
                    Activar alertas por WhatsApp para los equipos de este grupo. El usuario tiene que
                    haber completado la prueba de vinculación, o un admin debe haber aprobado su número.
                  </span>
                </label>
                {isSuper && editing.whatsappActivo === true && (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label>Números de WhatsApp de este grupo</Label>
                    <p className="text-xs text-muted-foreground">
                      Reciben las alertas de estos equipos y pueden consultarlos por WhatsApp. Si el
                      número ya tiene cuenta, no se duplica el equipo. En la web solo ve los equipos
                      que tiene asignados.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={waNombre}
                        onChange={(e) => setWaNombre(e.target.value)}
                        placeholder="Nombre"
                      />
                      <Input
                        value={waNumero}
                        onChange={(e) => setWaNumero(e.target.value)}
                        placeholder="987654321"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const nombre = waNombre.trim();
                          const telefono = waNumero.replace(/\D/g, '');
                          if (!nombre) {
                            toast.error('Escriba el nombre de quien recibe el WhatsApp');
                            return;
                          }
                          if (!(telefono.length === 9 && telefono.startsWith('9')) && !(telefono.length === 11 && telefono.startsWith('51'))) {
                            toast.error('El número debe ser de 9 dígitos, empezando por 9');
                            return;
                          }
                          const normal = telefono.length === 9 ? `51${telefono}` : telefono;
                          const actuales = editing.whatsappNumeros ?? [];
                          if (actuales.some((n) => n.telefono === normal)) {
                            toast.message('Ese número ya está en el grupo');
                            return;
                          }
                          setEditing({
                            ...editing,
                            whatsappNumeros: [...actuales, { nombre, telefono: normal }],
                          });
                          setWaNombre('');
                          setWaNumero('');
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    {(editing.whatsappNumeros?.length ?? 0) > 0 && (
                      <ul className="space-y-1">
                        {editing.whatsappNumeros!.map((n, index) => (
                          <li
                            key={`${n.telefono}-${index}`}
                            className="flex items-center gap-2 rounded-md border px-2 py-1"
                          >
                            {waEditIndex === index ? (
                              <>
                                <Input
                                  value={waEditNombre}
                                  onChange={(e) => setWaEditNombre(e.target.value)}
                                  className="h-8"
                                  placeholder="Nombre"
                                />
                                <Input
                                  value={waEditNumero}
                                  onChange={(e) => setWaEditNumero(e.target.value)}
                                  className="h-8"
                                  placeholder="987654321"
                                />
                                <Button type="button" size="sm" onClick={guardarEdicionWhatsapp}>
                                  Listo
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="text-sm flex-1 truncate">
                                  {n.nombre} · {n.telefono}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setWaEditIndex(index);
                                    setWaEditNombre(n.nombre);
                                    setWaEditNumero(n.telefono);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditing({
                                      ...editing,
                                      whatsappNumeros: (editing.whatsappNumeros ?? []).filter(
                                        (_, i) => i !== index
                                      ),
                                    });
                                    if (waEditIndex === index) setWaEditIndex(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {editing.emails.length > 0 && (
                  <ul className="space-y-1">
                    {editing.emails.map((correo, index) => (
                      <li
                        key={`${correo}-${index}`}
                        className="flex items-center gap-2 rounded-md border px-2 py-1"
                      >
                        {emailEditIndex === index ? (
                          <>
                            <Input
                              value={emailEditValue}
                              onChange={(e) => setEmailEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  guardarEdicionCorreo();
                                }
                              }}
                              className="h-8"
                            />
                            <Button type="button" size="sm" onClick={guardarEdicionCorreo}>
                              Listo
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm flex-1 truncate">{correo}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEmailEditIndex(index);
                                setEmailEditValue(correo);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing({
                                  ...editing,
                                  emails: editing.emails.filter((_, i) => i !== index),
                                });
                                if (emailEditIndex === index) setEmailEditIndex(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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
                  <div className="space-y-2">
                    <Label className="text-sm">Equipos en el grupo ({editing.devices.length})</Label>
                    <Input
                      value={busquedaGrupo}
                      onChange={(e) => setBusquedaGrupo(e.target.value)}
                      placeholder="Buscar en el grupo por nombre, IMEI o código"
                    />
                  </div>
                )}

                {editing.devices
                  .filter((dev) => {
                    const q = busquedaGrupo.trim().toLowerCase();
                    if (!q) return true;
                    const nombre = nombreDeEquipoGrupo(dev);
                    return `${nombre} ${dev.nombrePlataforma ?? ''} ${dev.imei} ${dev.codigo ?? ''} ${dev.descripcionEquipo ?? ''}`
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((dev) => (
                  <Card key={dev.rowKey} className="p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium block">{nombreDeEquipoGrupo(dev)}</span>
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
              Incidentes de correo (archivar, no eliminar)
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
