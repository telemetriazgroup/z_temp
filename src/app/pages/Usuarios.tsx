import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import type { User, UserRole } from '../types';
import {
  getUsers,
  addUser,
  updateUser,
  deleteUser,
  generateUserId,
  countSuperUsers,
} from '../modules/usuario';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';

function parseImeiList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDeviceNamesBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const pipe = trimmed.indexOf('|');
    let sep = eq >= 0 ? eq : pipe;
    if (sep < 0) continue;
    const imei = trimmed.slice(0, sep).trim();
    const name = trimmed.slice(sep + 1).trim();
    if (imei && name) out[imei] = name;
  }
  return out;
}

function imeiListToText(list: string[]): string {
  return list.filter((x) => x !== 'all').join('\n');
}

function deviceNamesToText(map: Record<string, string> | undefined): string {
  if (map == null) return '';
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

const emptyForm = {
  username: '',
  password: '',
  role: 'Solo Vista' as UserRole,
  superUser: false,
  imeiText: '',
  namesText: '',
};

export default function Usuarios() {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setUsers(getUsers());
  }, []);

  useEffect(() => {
    reload();
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

  const openEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: '',
      role: u.role,
      superUser: u.superUser === true,
      imeiText: u.superUser === true ? '' : imeiListToText(u.deviceAccess),
      namesText: u.superUser === true ? '' : deviceNamesToText(u.deviceNames),
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = () => {
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

    try {
      if (form.superUser) {
        if (editingId) {
          updateUser(editingId, {
            username,
            password: form.password.trim(),
            role: form.role,
            superUser: true,
            deviceAccess: ['all'],
            deviceNames: undefined,
          });
          if (currentUser?.id === editingId) refreshUser();
        } else {
          addUser({
            id: generateUserId(),
            username,
            password: form.password.trim(),
            role: form.role,
            superUser: true,
            deviceAccess: ['all'],
          });
        }
      } else {
        const imeis = parseImeiList(form.imeiText);
        if (imeis.length === 0) {
          setError('Indique al menos un IMEI o marque superusuario');
          return;
        }
        const deviceNames = parseDeviceNamesBlock(form.namesText);
        const hasNames = Object.keys(deviceNames).length > 0;
        if (editingId) {
          updateUser(editingId, {
            username,
            password: form.password.trim(),
            role: form.role,
            superUser: false,
            deviceAccess: imeis,
            deviceNames: hasNames ? deviceNames : undefined,
          });
          if (currentUser?.id === editingId) refreshUser();
        } else {
          addUser({
            id: generateUserId(),
            username,
            password: form.password.trim(),
            role: form.role,
            superUser: false,
            deviceAccess: imeis,
            deviceNames: hasNames ? deviceNames : undefined,
          });
        }
      }
      setDialogOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const handleDelete = (u: User) => {
    if (u.id === currentUser?.id) {
      alert('No puede eliminar su propia sesión desde aquí.');
      return;
    }
    if (!window.confirm(`¿Eliminar usuario «${u.username}»?`)) return;
    try {
      deleteUser(u.id);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Usuarios
          </h1>
          <p className="text-gray-500 mt-1">
            Alta, edición y baja de cuentas (almacenamiento local).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Superusuarios tienen acceso total y gestionan esta pantalla. El resto solo ve los IMEI
            indicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Dispositivos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    {u.superUser === true ? (
                      <Badge>Superusuario</Badge>
                    ) : (
                      <Badge variant="secondary">Restringido</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                    {u.superUser === true || u.deviceAccess.includes('all')
                      ? 'Todos'
                      : `${u.deviceAccess.length} IMEI`}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(u)}
                      disabled={
                        u.id === currentUser?.id ||
                        (u.superUser === true && countSuperUsers(users) <= 1)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Deje la contraseña vacía para no cambiarla.'
                : 'Defina credenciales y alcance de dispositivos.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Usuario</Label>
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
            <div className="grid gap-2">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Administrador">Administrador</SelectItem>
                  <SelectItem value="Monitoreo">Monitoreo</SelectItem>
                  <SelectItem value="Solo Vista">Solo Vista</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="super"
                checked={form.superUser}
                onCheckedChange={(c) =>
                  setForm((f) => ({ ...f, superUser: c === true }))
                }
              />
              <Label htmlFor="super" className="font-normal cursor-pointer">
                Superusuario (acceso total y este módulo)
              </Label>
            </div>
            {!form.superUser && (
              <>
                <div className="grid gap-2">
                  <Label>IMEI permitidos (uno por línea o separados por coma)</Label>
                  <Textarea
                    rows={5}
                    value={form.imeiText}
                    onChange={(e) => setForm((f) => ({ ...f, imeiText: e.target.value }))}
                    placeholder="866262034327402&#10;863576046886862"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Nombres por IMEI (opcional, una línea: IMEI=nombre)</Label>
                  <Textarea
                    rows={5}
                    value={form.namesText}
                    onChange={(e) => setForm((f) => ({ ...f, namesText: e.target.value }))}
                    placeholder="866262034327402=IFF ZGRU5295105 MP BIXINAS"
                    className="font-mono text-sm"
                  />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
