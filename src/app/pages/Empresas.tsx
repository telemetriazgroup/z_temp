import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import type { Empresa, User } from '../types';
import { getUsers } from '../modules/usuario';
import {
  fetchEmpresas,
  createEmpresaOnServer,
  updateEmpresaOnServer,
  deleteEmpresaOnServer,
  assignUserToEmpresa,
  unassignUserEmpresa,
} from '../modules/empresa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
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
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Building2, Plus, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useT } from '../i18n';

const emptyForm = {
  nombre: '',
  ruc: '',
  direccion: '',
  telefono: '',
  correo: '',
  activo: true,
};

export default function Empresas() {
  const t = useT();
  const { user: currentUser } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignEmpresaId, setAssignEmpresaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (currentUser?.superUser !== true) return;
    setLoading(true);
    try {
      const [emps, us] = await Promise.all([
        fetchEmpresas(),
        getUsers(currentUser.username),
      ]);
      setEmpresas(emps);
      setUsers(us);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.superUser, currentUser?.username]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (currentUser?.superUser !== true) {
    return <Navigate to="/" replace />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (e: Empresa) => {
    setEditingId(e.id);
    setForm({
      nombre: e.nombre,
      ruc: e.ruc ?? '',
      direccion: e.direccion ?? '',
      telefono: e.telefono ?? '',
      correo: e.correo ?? '',
      activo: e.activo !== false,
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    setError(null);
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        ruc: form.ruc.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        correo: form.correo.trim() || undefined,
        activo: form.activo,
      };
      if (editingId) {
        await updateEmpresaOnServer(editingId, payload, currentUser.username);
      } else {
        await createEmpresaOnServer(payload, currentUser.username);
      }
      setDialogOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: Empresa) => {
    if (!window.confirm(`¿Eliminar empresa «${e.nombre}»? Los usuarios quedarán sin empresa.`)) {
      return;
    }
    try {
      await deleteEmpresaOnServer(e.id, currentUser.username);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  const submitAssign = async () => {
    if (!assignUserId) {
      setError('Seleccione un usuario');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!assignEmpresaId || assignEmpresaId === '__none__') {
        await unassignUserEmpresa(assignUserId, currentUser.username);
      } else {
        await assignUserToEmpresa(assignEmpresaId, assignUserId, currentUser.username);
      }
      setAssignOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al asignar');
    } finally {
      setSaving(false);
    }
  };

  const empresaName = (id?: string) =>
    empresas.find((e) => e.id === id)?.nombre ?? '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            {t('empresas.title')}
          </h1>
          <p className="text-gray-500 mt-1">
            Alta de empresas y asignación a usuarios.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setAssignUserId('');
              setAssignEmpresaId('');
              setError(null);
              setAssignOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Asignar usuario
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva empresa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Cada usuario puede pertenecer a una empresa (visible en su perfil).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : empresas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay empresas registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RUC</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Usuarios</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((e) => {
                  const count = users.filter((u) => u.empresaId === e.id).length;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nombre}</TableCell>
                      <TableCell>{e.ruc ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[e.correo, e.telefono].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>
                        {e.activo !== false ? (
                          <Badge>Activa</Badge>
                        ) : (
                          <Badge variant="secondary">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDelete(e)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios y empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Empresa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    {[u.nombres, u.apellidos].filter(Boolean).join(' ') ||
                      u.displayName ||
                      '—'}
                  </TableCell>
                  <TableCell>{empresaName(u.empresaId)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
            <DialogDescription>Datos de la organización.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>RUC</Label>
              <Input
                value={form.ruc}
                onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Dirección</Label>
              <Input
                value={form.direccion}
                onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-1.5">
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Correo</Label>
                <Input
                  value={form.correo}
                  onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="activo"
                checked={form.activo}
                onCheckedChange={(c) => setForm((f) => ({ ...f, activo: c === true }))}
              />
              <Label htmlFor="activo" className="font-normal cursor-pointer">
                Empresa activa
              </Label>
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar usuario a empresa</DialogTitle>
            <DialogDescription>
              Elija usuario y empresa (o «Sin empresa» para quitar asignación).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Usuario</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.username}
                      {u.nombres || u.apellidos
                        ? ` — ${[u.nombres, u.apellidos].filter(Boolean).join(' ')}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Empresa</Label>
              <Select value={assignEmpresaId} onValueChange={setAssignEmpresaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {empresas
                    .filter((e) => e.activo !== false)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submitAssign()} disabled={saving}>
              {saving ? 'Guardando…' : 'Asignar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
