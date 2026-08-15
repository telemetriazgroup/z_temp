import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import type { Empresa, User, UserRole, UserSexo, UserCategory } from '../types';
import {
  getUsers,
  addUser,
  updateUser,
  deleteUser,
  generateUserId,
  countSuperUsers,
  userCanManageUsers,
  userIsSuperAdmin,
  userIsAdmin,
  resolveUserCategory,
  adminMaxManagedUsers,
  categoryLabel,
} from '../modules/usuario';
import { fetchEmpresas } from '../modules/empresa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
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
import { Plus, Pencil, Trash2, Shield, Thermometer } from 'lucide-react';

const emptyForm = {
  username: '',
  password: '',
  role: 'Monitoreo' as UserRole,
  category: 'user' as UserCategory,
  superUser: false,
  maxManagedUsers: '3',
  nombres: '',
  apellidos: '',
  cargo: '',
  dni: '',
  correo: '',
  telefono: '',
  sexo: '' as '' | UserSexo,
  empresaId: '' as string,
  zonaHoraria: 'GMT-5',
  puedeControlTemperatura: false,
};

function personalPayload(form: typeof emptyForm) {
  return {
    nombres: form.nombres.trim() || undefined,
    apellidos: form.apellidos.trim() || undefined,
    cargo: form.cargo.trim() || undefined,
    dni: form.dni.trim() || undefined,
    correo: form.correo.trim() || undefined,
    telefono: form.telefono.trim() || undefined,
    sexo: form.sexo || undefined,
    empresaId: form.empresaId && form.empresaId !== '__none__' ? form.empresaId : '',
    zonaHoraria: form.zonaHoraria,
    displayName:
      [form.nombres.trim(), form.apellidos.trim()].filter(Boolean).join(' ') || undefined,
  };
}

export default function Usuarios() {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSuper = userIsSuperAdmin(currentUser);
  const isAdmin = userIsAdmin(currentUser);
  const canManage = userCanManageUsers(currentUser);
  const quotaMax = adminMaxManagedUsers(currentUser);
  const managedCount = users.filter(
    (u) =>
      u.createdBy &&
      u.createdBy.toLowerCase() === (currentUser?.username ?? '').toLowerCase() &&
      u.id !== currentUser?.id
  ).length;

  const reload = useCallback(async () => {
    if (!userCanManageUsers(currentUser)) return;
    setLoading(true);
    try {
      const [list, emps] = await Promise.all([
        getUsers(currentUser!.username),
        fetchEmpresas().catch(() => [] as Empresa[]),
      ]);
      setUsers(list);
      setEmpresas(emps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!canManage) {
    return <Navigate to="/" replace />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      category: isAdmin ? 'user' : 'user',
      role: isAdmin ? 'Monitoreo' : 'Monitoreo',
    });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    const cat = resolveUserCategory(u);
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: '',
      role: u.role,
      category: cat,
      superUser: cat === 'superadmin',
      maxManagedUsers: String(u.maxManagedUsers ?? 3),
      nombres: u.nombres ?? '',
      apellidos: u.apellidos ?? '',
      cargo: u.cargo ?? '',
      dni: u.dni ?? '',
      correo: u.correo ?? '',
      telefono: u.telefono ?? '',
      sexo: (u.sexo as UserSexo) ?? '',
      empresaId: u.empresaId ?? '',
      zonaHoraria: u.zonaHoraria ?? 'GMT-5',
      puedeControlTemperatura: u.puedeControlTemperatura === true,
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    const username = form.username.trim();
    if (!username) {
      setError('El usuario es obligatorio');
      return;
    }
    if (!editingId && !form.password.trim()) {
      setError('La contraseña es obligatoria al crear');
      return;
    }

    setSaving(true);
    try {
      const personal = personalPayload(form);
      let category: UserCategory = form.category;
      if (isAdmin) category = 'user';
      if (form.superUser && isSuper) category = 'superadmin';

      const payloadBase = {
        username,
        password: form.password.trim(),
        role: form.role,
        category,
        superUser: category === 'superadmin',
        puedeControlTemperatura: form.puedeControlTemperatura === true,
        ...personal,
      };

      if (category === 'superadmin' || category === 'admin') {
        const maxN = Number(form.maxManagedUsers);
        const adminFields =
          category === 'admin'
            ? {
                // Flota la asigna el superadmin en Administración (no 'all').
                deviceAccess: [] as string[],
                groupIds: [] as string[],
                maxManagedUsers: Number.isFinite(maxN) ? maxN : 3,
                deviceNames: undefined,
              }
            : { deviceAccess: ['all'] as string[], deviceNames: undefined };

        if (editingId) {
          const prev = users.find((x) => x.id === editingId);
          const keepAccess =
            category === 'admin' && editingId
              ? {
                  deviceAccess: prev?.deviceAccess?.includes('all')
                    ? []
                    : (prev?.deviceAccess ?? []),
                  groupIds: prev?.groupIds ?? [],
                  maxManagedUsers: Number.isFinite(maxN) ? maxN : 3,
                  deviceNames: undefined,
                }
              : adminFields;
          await updateUser(
            editingId,
            {
              ...payloadBase,
              ...(category === 'admin' ? keepAccess : adminFields),
            },
            currentUser!.username
          );
          if (currentUser?.id === editingId) await refreshUser();
        } else {
          await addUser(
            {
              id: generateUserId(),
              ...payloadBase,
              ...adminFields,
            } as User,
            currentUser!.username
          );
        }
      } else {
        // Flota solo vía Administración (sin IMEI libre en este formulario).
        if (editingId) {
          await updateUser(editingId, { ...payloadBase }, currentUser!.username);
          if (currentUser?.id === editingId) await refreshUser();
        } else {
          await addUser(
            {
              id: generateUserId(),
              ...payloadBase,
              deviceAccess: [],
              groupIds: [],
            } as User,
            currentUser!.username
          );
        }
      }
      setDialogOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (u.id === currentUser?.id) {
      alert('No puede eliminar su propia sesión desde aquí.');
      return;
    }
    if (!window.confirm(`¿Eliminar usuario «${u.username}»?`)) return;
    try {
      await deleteUser(u.id, currentUser!.username);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  const empresaLabel = (id?: string) =>
    empresas.find((e) => e.id === id)?.nombre ?? '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Usuarios
          </h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? `Admin: puede crear hasta ${quotaMax} usuarios (${managedCount}/${quotaMax}). Los equipos se asignan en Administración.`
              : 'Superadmin: gestión completa de categorías, cuotas y flota.'}
          </p>
        </div>
        <Button onClick={openCreate} disabled={isAdmin && managedCount >= quotaMax}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Incluye datos personales opcionales y empresa asignada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-sm">
                      {[u.nombres, u.apellidos].filter(Boolean).join(' ') ||
                        u.displayName ||
                        '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.cargo ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">{empresaLabel(u.empresaId)}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant={
                            resolveUserCategory(u) === 'superadmin'
                              ? 'default'
                              : resolveUserCategory(u) === 'admin'
                                ? 'outline'
                                : 'secondary'
                          }
                        >
                          {categoryLabel(u)}
                        </Badge>
                        {u.puedeControlTemperatura === true && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-[10px]"
                            title="Control de temperaturas"
                          >
                            <Thermometer className="h-3 w-3" />
                            Control
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(u)}
                        disabled={
                          u.id === currentUser?.id ||
                          (isAdmin && resolveUserCategory(u) !== 'user')
                        }
                        title={
                          u.id === currentUser?.id
                            ? 'Edite su cuenta en Ver perfil'
                            : undefined
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(u)}
                        disabled={
                          u.id === currentUser?.id ||
                          (userIsSuperAdmin(u) && countSuperUsers(users) <= 1) ||
                          (isAdmin && resolveUserCategory(u) !== 'user')
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Deje la contraseña vacía para no cambiarla. Campos personales son opcionales.'
                : 'Defina credenciales y datos opcionales. Los equipos pueden asignarse después en Administración.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Usuario *</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  disabled={editingId != null}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Nombres</Label>
                <Input
                  value={form.nombres}
                  onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Apellidos</Label>
                <Input
                  value={form.apellidos}
                  onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Cargo</Label>
                <Input
                  value={form.cargo}
                  onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>DNI</Label>
                <Input
                  value={form.dni}
                  onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Sexo</Label>
                <Select
                  value={form.sexo || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      sexo: v === '__none__' ? '' : (v as UserSexo),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                    <SelectItem value="O">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Empresa</Label>
                <Select
                  value={form.empresaId || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      empresaId: v === '__none__' ? '' : v,
                    }))
                  }
                >
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
            </div>

            <div className="grid gap-2">
              <Label>Rol operativo</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!isAdmin && (
                    <SelectItem value="Administrador">Administrador</SelectItem>
                  )}
                  <SelectItem value="Monitoreo">Monitoreo</SelectItem>
                  <SelectItem value="Solo Vista">Solo Vista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isSuper && (
              <>
                <div className="grid gap-2">
                  <Label>Categoría</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        category: v as UserCategory,
                        superUser: v === 'superadmin',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuario</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.category === 'admin' && (
                  <div className="grid gap-2">
                    <Label>Cuota máx. usuarios gestionables</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.maxManagedUsers}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, maxManagedUsers: e.target.value }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Por defecto 3. Solo el superadmin puede ampliarla.
                    </p>
                  </div>
                )}
              </>
            )}

            {(isAdmin || form.category === 'user') && (
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                Los equipos no se escriben aquí (evita IMEI ajenos). Asigne grupos o
                equipos en Administración → Asignaciones
                {isAdmin ? ` · Cuota: ${managedCount}/${quotaMax}` : ''}.
                {isSuper
                  ? ' Solo el superadmin define grupos e IMEI de flota.'
                  : ''}
              </p>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="puede-control-temp"
                  checked={form.puedeControlTemperatura}
                  onCheckedChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      puedeControlTemperatura: v === true,
                    }))
                  }
                />
                <div className="grid gap-1 leading-none">
                  <Label
                    htmlFor="puede-control-temp"
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <Thermometer className="h-3.5 w-3.5" />
                    Control de temperaturas
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Permite ver y usar el panel de control remoto (setpoint, defrost,
                    stop) en equipos reefer TUNEL. Desactivado por defecto. El
                    superadmin siempre tiene este acceso.
                  </p>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
