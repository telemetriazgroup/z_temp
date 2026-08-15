import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import type { DispositivoUltimoEstado, Empresa, GrupoEquipo, User } from '../types';
import {
  getUsers,
  updateUser,
  userCanManageUsers,
  userIsSuperAdmin,
  userIsAdmin,
  resolveUserCategory,
  categoryLabel,
  displayNameForDevice,
} from '../modules/usuario';
import {
  fetchGruposEquipos,
  createGrupoEquipo,
  updateGrupoEquipoOnServer,
  deleteGrupoEquipoOnServer,
  setGruposEquiposCache,
  imeisFromGroupIds,
  effectiveDeviceAccessForUser,
} from '../modules/administracion';
import { fetchEmpresas } from '../modules/empresa';
import { useDispositivosFleet } from '../DispositivosFleetContext';
import { readDeviceLocalNames } from '../lib/deviceLocalNames';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
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
import { cn } from '../components/ui/utils';
import {
  FolderTree,
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Building2,
  Container,
  Link2,
  Save,
} from 'lucide-react';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function deviceLabel(
  d: DispositivoUltimoEstado,
  localNames: Record<string, string>,
  user: User | null
): string {
  const rk = d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
  return displayNameForDevice(user, d.imei, rk, localNames, SIN_ASIGNAR);
}

function statusBadge(estado: string | undefined) {
  const s = String(estado ?? '').toLowerCase();
  if (s === 'online') return <Badge className="bg-emerald-600 text-[10px] h-5">online</Badge>;
  if (s === 'wait') return <Badge className="bg-amber-600 text-[10px] h-5">wait</Badge>;
  return <Badge variant="destructive" className="text-[10px] h-5">offline</Badge>;
}

export default function Administracion() {
  const { user: currentUser, refreshUser } = useAuth();
  const canManage = userCanManageUsers(currentUser);
  const isSuper = userIsSuperAdmin(currentUser);
  const isAdmin = userIsAdmin(currentUser);

  const { data: fleetData, ensureFleet, loading: fleetLoading } = useDispositivosFleet();
  const dispositivos = fleetData?.data?.dispositivos ?? [];

  const [users, setUsers] = useState<User[]>([]);
  const [grupos, setGrupos] = useState<GrupoEquipo[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [localNames] = useState(() => readDeviceLocalNames());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Asignaciones
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftGroupIds, setDraftGroupIds] = useState<string[]>([]);
  const [draftImeis, setDraftImeis] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');

  // Grupos CRUD
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<GrupoEquipo | null>(null);
  const [gNombre, setGNombre] = useState('');
  const [gEmpresaId, setGEmpresaId] = useState<string>('__none__');
  const [gImeis, setGImeis] = useState<string[]>([]);
  const [gDeviceSearch, setGDeviceSearch] = useState('');

  const reload = useCallback(async () => {
    if (!currentUser?.username || !canManage) return;
    setLoading(true);
    setError(null);
    try {
      const [uList, gList, eList] = await Promise.all([
        getUsers(currentUser.username),
        fetchGruposEquipos(currentUser.username, isSuper),
        fetchEmpresas().catch(() => [] as Empresa[]),
        ensureFleet(),
      ]);
      setUsers(uList);
      setGrupos(gList);
      setGruposEquiposCache(gList);
      setEmpresas(eList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar administración');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.username, canManage, isSuper, ensureFleet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const operableUsers = useMemo(() => {
    return users.filter((u) => {
      const cat = resolveUserCategory(u);
      // Nunca asignar a superadmin (flota completa).
      if (cat === 'superadmin') return false;
      // Admin actor: solo usuarios operativos que creó (ya viene filtrado del API).
      if (isAdmin && !isSuper) return cat === 'user';
      // Superadmin: usuarios y admins (para darles flota).
      return cat === 'user' || cat === 'admin';
    });
  }, [users, isAdmin, isSuper]);

  /** Flota que el actor actual puede asignar. */
  const actorAssignableImeis = useMemo((): 'all' | Set<string> => {
    if (isSuper) return 'all';
    const eff = effectiveDeviceAccessForUser(currentUser);
    if (eff === 'all') return 'all';
    return new Set(eff);
  }, [isSuper, currentUser]);

  const actorAssignableDevices = useMemo(() => {
    if (actorAssignableImeis === 'all') return dispositivos;
    return dispositivos.filter((d) => actorAssignableImeis.has(d.imei));
  }, [dispositivos, actorAssignableImeis]);

  const actorAssignableGrupos = useMemo(() => {
    if (actorAssignableImeis === 'all') return grupos;
    const actorGids = new Set(
      Array.isArray(currentUser?.groupIds) ? currentUser!.groupIds : []
    );
    return grupos.filter((g) => {
      if (actorGids.has(g.id)) return true;
      return (g.imeis ?? []).every((imei) => actorAssignableImeis.has(String(imei)));
    });
  }, [grupos, actorAssignableImeis, currentUser]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return operableUsers;
    return operableUsers.filter((u) => {
      const hay = [u.username, u.displayName, u.nombres, u.apellidos, u.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [operableUsers, userSearch]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const canAssignToSelected =
    selectedUser != null && resolveUserCategory(selectedUser) !== 'superadmin';

  useEffect(() => {
    if (!selectedUser) {
      setDraftGroupIds([]);
      setDraftImeis([]);
      return;
    }
    const cat = resolveUserCategory(selectedUser);
    if (cat === 'superadmin') {
      setDraftGroupIds([]);
      setDraftImeis([]);
      return;
    }
    setDraftGroupIds([...(selectedUser.groupIds ?? [])]);
    const access = selectedUser.deviceAccess ?? [];
    setDraftImeis(
      access.includes('all') ? [] : access.filter((x) => x && x !== 'all')
    );
  }, [selectedUser]);

  const empresaNombre = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      return empresas.find((e) => e.id === id)?.nombre ?? id;
    },
    [empresas]
  );

  const deviceByImei = useMemo(() => {
    const m = new Map<string, DispositivoUltimoEstado>();
    for (const d of dispositivos) m.set(d.imei, d);
    return m;
  }, [dispositivos]);

  const filteredGruposAssign = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    const base = actorAssignableGrupos;
    if (!q) return base;
    return base.filter((g) => {
      const emp = empresaNombre(g.empresaId) ?? '';
      return `${g.nombre} ${emp}`.toLowerCase().includes(q);
    });
  }, [actorAssignableGrupos, groupSearch, empresaNombre]);

  const filteredDevicesAssign = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase();
    return actorAssignableDevices.filter((d) => {
      if (!q) return true;
      const name = deviceLabel(d, localNames, currentUser);
      return (
        d.imei.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        String(d.codigo ?? '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [actorAssignableDevices, deviceSearch, localNames, currentUser]);

  const filteredDevicesForGrupo = useMemo(() => {
    const q = gDeviceSearch.trim().toLowerCase();
    // Al crear grupos, admin solo ve su flota; superadmin toda.
    const base = actorAssignableDevices;
    return base.filter((d) => {
      if (!q) return true;
      const name = deviceLabel(d, localNames, currentUser);
      return (
        d.imei.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        String(d.codigo ?? '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [actorAssignableDevices, gDeviceSearch, localNames, currentUser]);

  const selectUser = (u: User) => {
    setSelectedUserId(u.id);
  };

  const toggleDraftGroup = (id: string) => {
    setDraftGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleDraftImei = (imei: string) => {
    setDraftImeis((prev) =>
      prev.includes(imei) ? prev.filter((x) => x !== imei) : [...prev, imei]
    );
  };

  const saveAssignments = async () => {
    if (!selectedUser || !currentUser?.username) return;
    const cat = resolveUserCategory(selectedUser);
    if (cat === 'superadmin') {
      setError('El superadmin ya tiene acceso a toda la flota.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUser(
        selectedUser.id,
        {
          groupIds: draftGroupIds,
          deviceAccess: draftImeis,
        },
        currentUser.username
      );
      if (selectedUser.id === currentUser.id) await refreshUser();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la asignación');
    } finally {
      setSaving(false);
    }
  };

  const openCreateGrupo = () => {
    if (!isSuper) {
      setError('Solo el superadmin puede crear grupos e IMEI.');
      return;
    }
    setEditingGrupo(null);
    setGNombre('');
    setGEmpresaId('__none__');
    setGImeis([]);
    setGDeviceSearch('');
    setGroupDialogOpen(true);
  };

  const openEditGrupo = (g: GrupoEquipo) => {
    if (!isSuper) {
      setError('Solo el superadmin puede editar grupos e IMEI.');
      return;
    }
    setEditingGrupo(g);
    setGNombre(g.nombre);
    setGEmpresaId(g.empresaId || '__none__');
    setGImeis([...(g.imeis ?? [])]);
    setGDeviceSearch('');
    setGroupDialogOpen(true);
  };

  const saveGrupo = async () => {
    if (!currentUser?.username) return;
    if (!isSuper) {
      setError('Solo el superadmin puede crear o editar grupos e IMEI.');
      return;
    }
    const nombre = gNombre.trim();
    if (!nombre) {
      setError('El nombre del grupo es obligatorio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nombre,
        empresaId: gEmpresaId === '__none__' ? null : gEmpresaId,
        imeis: gImeis,
      };
      if (editingGrupo) {
        await updateGrupoEquipoOnServer(
          editingGrupo.id,
          payload,
          currentUser.username,
          isSuper
        );
      } else {
        await createGrupoEquipo(payload, currentUser.username, isSuper);
      }
      setGroupDialogOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el grupo');
    } finally {
      setSaving(false);
    }
  };

  const removeGrupo = async (g: GrupoEquipo) => {
    if (!currentUser?.username) return;
    if (!isSuper) {
      setError('Solo el superadmin puede eliminar grupos.');
      return;
    }
    if (!confirm(`¿Eliminar el grupo «${g.nombre}»? Se quitará de las cuentas asignadas.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteGrupoEquipoOnServer(g.id, currentUser.username, isSuper);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el grupo');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return <Navigate to="/" replace />;
  }

  const assignedGrupos = grupos.filter((g) => draftGroupIds.includes(g.id));
  const imeisViaGrupos = imeisFromGroupIds(draftGroupIds, grupos);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Administración</h1>
          <p className="text-muted-foreground mt-1">
            Grupos de equipos y asignación a cuentas
            {isAdmin && !isSuper ? ' (solo usuarios que usted creó)' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/usuarios">
              <Users className="h-4 w-4 mr-2" />
              Usuarios
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="asignaciones" className="w-full">
        <TabsList>
          <TabsTrigger value="asignaciones" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Asignaciones
          </TabsTrigger>
          <TabsTrigger value="grupos" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            Grupos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="asignaciones" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Columna usuarios */}
            <Card className="xl:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Usuarios
                </CardTitle>
                <div className="relative pt-1">
                  <Search className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Buscar usuario…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto p-2">
                {loading ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">Cargando…</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    Sin usuarios
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredUsers.map((u) => {
                      const active = u.id === selectedUserId;
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => selectUser(u)}
                            className={cn(
                              'w-full text-left rounded-md px-2.5 py-2 text-sm transition-colors',
                              active
                                ? 'bg-primary/10 ring-1 ring-primary/30'
                                : 'hover:bg-muted/60'
                            )}
                          >
                            <div className="font-medium truncate">{u.username}</div>
                            <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                              <span>{categoryLabel(u)}</span>
                              <span>·</span>
                              <span>{u.role}</span>
                            </div>
                            {resolveUserCategory(u) !== 'superadmin' && (
                              <div className="mt-1 flex gap-1">
                                {(u.groupIds?.length ?? 0) > 0 && (
                                  <Badge variant="secondary" className="text-[10px] h-5">
                                    {u.groupIds!.length} grupo
                                    {u.groupIds!.length === 1 ? '' : 's'}
                                  </Badge>
                                )}
                                {u.deviceAccess?.includes('all') ? (
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    flota total
                                  </Badge>
                                ) : (u.deviceAccess?.length ?? 0) > 0 ? (
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    {u.deviceAccess!.length} equipo
                                    {u.deviceAccess!.length === 1 ? '' : 's'}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] h-5 text-amber-700">
                                    sin equipos
                                  </Badge>
                                )}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Asignaciones actuales */}
            <Card className="xl:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Asignaciones actuales</CardTitle>
                <CardDescription className="text-xs">
                  {selectedUser
                    ? `${selectedUser.username} · ${categoryLabel(selectedUser)}`
                    : 'Seleccione un usuario'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {!selectedUser ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Elija una cuenta a la izquierda
                  </p>
                ) : !canAssignToSelected ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-3">
                    El superadmin ya tiene acceso a toda la flota.
                  </p>
                ) : (
                  <>
                    {resolveUserCategory(selectedUser) === 'admin' &&
                      (selectedUser.deviceAccess?.includes('all') ?? false) && (
                        <p className="text-[11px] text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
                          Esta cuenta admin tenía acceso total. Al guardar, se
                          reemplaza por los grupos/equipos que marque.
                        </p>
                      )}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Grupos asignados
                      </p>
                      {assignedGrupos.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Ninguno</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {assignedGrupos.map((g) => (
                            <Badge key={g.id} className="bg-sky-600 hover:bg-sky-600">
                              {g.nombre}
                              {g.empresaId
                                ? ` · ${empresaNombre(g.empresaId) ?? ''}`
                                : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Equipos directos
                      </p>
                      {draftImeis.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Ninguno</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {draftImeis.map((imei) => {
                            const d = deviceByImei.get(imei);
                            const name = d
                              ? deviceLabel(d, localNames, currentUser)
                              : imei;
                            return (
                              <Badge
                                key={imei}
                                variant="secondary"
                                className="font-normal max-w-full"
                              >
                                <span className="truncate">
                                  {name !== SIN_ASIGNAR && name !== imei
                                    ? name
                                    : imei}
                                </span>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Equipos por grupo ({imeisViaGrupos.length})
                      </p>
                      {assignedGrupos.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <ul className="space-y-2">
                          {assignedGrupos.map((g) => (
                            <li key={g.id} className="rounded-md border p-2">
                              <div className="text-xs font-medium flex items-center gap-1.5">
                                <FolderTree className="h-3.5 w-3.5 text-amber-600" />
                                {g.nombre} ({g.imeis.length})
                              </div>
                              <ul className="mt-1.5 space-y-1 pl-1">
                                {g.imeis.map((imei) => {
                                  const d = deviceByImei.get(imei);
                                  return (
                                    <li
                                      key={imei}
                                      className="text-[11px] flex items-center justify-between gap-2"
                                    >
                                      <span className="truncate font-mono">
                                        {d
                                          ? deviceLabel(d, localNames, currentUser)
                                          : imei}
                                      </span>
                                      {d && statusBadge(d.estado_conexion)}
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        className="w-full"
                        onClick={() => void saveAssignments()}
                        disabled={saving}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Guardando…' : 'Guardar asignación'}
                      </Button>
                      {(draftGroupIds.length > 0 || draftImeis.length > 0) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={saving}
                          onClick={() => {
                            setDraftGroupIds([]);
                            setDraftImeis([]);
                            setError(null);
                          }}
                        >
                          Quitar todas las asignaciones
                        </Button>
                      )}
                      <p className="text-[11px] text-muted-foreground text-center">
                        Puede guardar sin grupos ni equipos; el usuario verá el aviso
                        de flota vacía hasta que se le asigne algo.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Asignar */}
            <Card className="xl:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Asignar a seleccionados</CardTitle>
                <CardDescription className="text-xs">
                  Marque grupos y/o equipos individuales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {!canAssignToSelected ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Seleccione un usuario o admin para asignar equipos
                    {!isSuper
                      ? ' (solo su flota autorizada)'
                      : ''}
                  </p>
                ) : (
                  <>
                    {!isSuper && actorAssignableImeis !== 'all' && (
                      <p className="text-[11px] text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                        Solo puede asignar equipos de la flota que le autorizó el
                        superadmin ({actorAssignableImeis.size} IMEI
                        {actorAssignableImeis.size === 1 ? '' : 's'}).
                      </p>
                    )}
                    <div>
                      <Label className="text-xs">Grupos de equipos</Label>
                      <div className="relative mt-1 mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8 h-8 text-sm"
                          placeholder="Buscar grupo…"
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                        />
                      </div>
                      <ul className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-1.5">
                        {filteredGruposAssign.length === 0 ? (
                          <li className="text-xs text-muted-foreground p-2 text-center">
                            No hay grupos. Cree uno en la pestaña Grupos.
                          </li>
                        ) : (
                          filteredGruposAssign.map((g) => (
                            <li key={g.id}>
                              <label className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                                <Checkbox
                                  checked={draftGroupIds.includes(g.id)}
                                  onCheckedChange={() => toggleDraftGroup(g.id)}
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="font-medium block truncate">
                                    {g.nombre}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {g.imeis.length} equipo
                                    {g.imeis.length === 1 ? '' : 's'}
                                    {g.empresaId
                                      ? ` · ${empresaNombre(g.empresaId)}`
                                      : ''}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    <div>
                      <Label className="text-xs">Equipos (individual)</Label>
                      <div className="relative mt-1 mb-2">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8 h-8 text-sm"
                          placeholder="Buscar IMEI o nombre…"
                          value={deviceSearch}
                          onChange={(e) => setDeviceSearch(e.target.value)}
                        />
                      </div>
                      <ul className="space-y-1 max-h-52 overflow-y-auto border rounded-md p-1.5">
                        {fleetLoading && dispositivos.length === 0 ? (
                          <li className="text-xs text-muted-foreground p-2 text-center">
                            Cargando flota…
                          </li>
                        ) : filteredDevicesAssign.length === 0 ? (
                          <li className="text-xs text-muted-foreground p-2 text-center">
                            Sin equipos
                          </li>
                        ) : (
                          filteredDevicesAssign.map((d) => (
                            <li key={`${d.codigo ?? ''}-${d.imei}`}>
                              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                                <Checkbox
                                  checked={draftImeis.includes(d.imei)}
                                  onCheckedChange={() => toggleDraftImei(d.imei)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium block truncate text-xs">
                                    {deviceLabel(d, localNames, currentUser)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono truncate block">
                                    {d.codigo ? `${d.codigo} · ` : ''}
                                    {d.imei}
                                  </span>
                                </span>
                                {statusBadge(d.estado_conexion)}
                              </label>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grupos" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle>Grupos de equipos</CardTitle>
                  <CardDescription>
                    {isSuper
                      ? 'Cree grupos con o sin empresa de referencia y vincule reefers (IMEI). Luego asígnelos a cuentas en Asignaciones.'
                      : 'Solo el superadmin define grupos e IMEI. Usted puede asignar los grupos/equipos de su flota en Asignaciones.'}
                  </CardDescription>
                </div>
                {isSuper && (
                  <Button onClick={openCreateGrupo}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo grupo
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {grupos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aún no hay grupos
                  {isSuper ? '. Cree el primero para organizar equipos.' : '.'}
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {(isSuper ? grupos : actorAssignableGrupos).map((g) => (
                    <li
                      key={g.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <FolderTree className="h-4 w-4 text-amber-600 shrink-0" />
                          {g.nombre}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                          <span>
                            {g.imeis.length} equipo{g.imeis.length === 1 ? '' : 's'}
                          </span>
                          {g.empresaId ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {empresaNombre(g.empresaId)}
                            </span>
                          ) : (
                            <span>Sin empresa</span>
                          )}
                        </div>
                      </div>
                      {isSuper && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditGrupo(g)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removeGrupo(g)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGrupo ? 'Editar grupo' : 'Nuevo grupo de equipos'}
            </DialogTitle>
            <DialogDescription>
              La empresa es opcional (solo referencia). Seleccione los reefers del
              grupo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input
                value={gNombre}
                onChange={(e) => setGNombre(e.target.value)}
                placeholder="ej. IFF-MATERIA PRIMA"
              />
            </div>
            <div className="grid gap-2">
              <Label>Empresa (opcional)</Label>
              <Select value={gEmpresaId} onValueChange={setGEmpresaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <Container className="h-3.5 w-3.5" />
                Equipos ({gImeis.length})
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Filtrar flota…"
                  value={gDeviceSearch}
                  onChange={(e) => setGDeviceSearch(e.target.value)}
                />
              </div>
              <ul className="max-h-56 overflow-y-auto border rounded-md p-1.5 space-y-0.5">
                {filteredDevicesForGrupo.map((d) => (
                  <li key={`${d.codigo ?? ''}-${d.imei}`}>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={gImeis.includes(d.imei)}
                        onCheckedChange={() =>
                          setGImeis((prev) =>
                            prev.includes(d.imei)
                              ? prev.filter((x) => x !== d.imei)
                              : [...prev, d.imei]
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {deviceLabel(d, localNames, currentUser)}
                        <span className="text-muted-foreground font-mono block text-[10px]">
                          {d.imei}
                        </span>
                      </span>
                      {statusBadge(d.estado_conexion)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveGrupo()} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
