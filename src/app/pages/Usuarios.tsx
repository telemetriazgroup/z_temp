import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { User, UserRole } from '../types';
import {
  addUser,
  countSuperUsers,
  deleteUser,
  ensureUserRegistry,
  generateUserId,
  getUsers,
  updateUser,
} from '../modules/usuario';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Trash2, Pencil, KeyRound, UserPlus } from 'lucide-react';

function parseDeviceAccess(raw: string): string[] {
  const t = raw.trim();
  if (t.toLowerCase() === 'all') return ['all'];
  return t.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

function formatDeviceAccess(access: string[]): string {
  if (access.length === 1 && access[0] === 'all') return 'all';
  return access.join(', ');
}

function parseDeviceNames(raw: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bar = trimmed.indexOf('|');
    if (bar === -1) continue;
    const imei = trimmed.slice(0, bar).trim();
    const nombreEtiqueta = trimmed.slice(bar + 1).trim();
    if (imei) out[imei] = nombreEtiqueta;
  }
  return Object.keys(out).length ? out : undefined;
}

function formatDeviceNames(map: Record<string, string> | undefined): string {
  if (map == null) return '';
  return Object.entries(map)
    .map(([k, v]) => `${k}|${v}`)
    .join('\n');
}

const ROLES: UserRole[] = ['Administrador', 'Monitoreo', 'Solo Vista'];

export default function Usuarios() {
  const [rows, setRows] = useState<User[]>([]);
  const refresh = useCallback(() => {
    ensureUserRegistry();
    setRows(getUsers());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [username, setUsername] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Monitoreo');
  const [superUser, setSuperUser] = useState(false);
  const [deviceAccessRaw, setDeviceAccessRaw] = useState('');
  const [deviceNamesRaw, setDeviceNamesRaw] = useState('');

  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [resetPass2, setResetPass2] = useState('');

  const openCreate = () => {
    setEditing(null);
    setNombre('');
    setCorreo('');
    setUsername('');
    setEmpresa('');
    setPassword('');
    setRole('Monitoreo');
    setSuperUser(false);
    setDeviceAccessRaw('all');
    setDeviceNamesRaw('');
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setNombre(u.nombre);
    setCorreo(u.correo);
    setUsername(u.username);
    setEmpresa(u.empresa);
    setPassword('');
    setRole(u.role);
    setSuperUser(u.superUser === true);
    setDeviceAccessRaw(formatDeviceAccess(u.deviceAccess));
    setDeviceNamesRaw(formatDeviceNames(u.deviceNames));
    setDialogOpen(true);
  };

  const openReset = (u: User) => {
    setResetTarget(u);
    setResetPass('');
    setResetPass2('');
    setResetOpen(true);
  };

  const handleSaveDialog = () => {
    try {
      const access = parseDeviceAccess(deviceAccessRaw);
      const namesMap = parseDeviceNames(deviceNamesRaw);
      const effectiveRole: UserRole = superUser === true ? 'Administrador' : role;
      const deviceNames = namesMap ?? undefined;

      if (!nombre.trim() || !username.trim()) {
        toast.error('Nombre y usuario de acceso son obligatorios.');
        return;
      }

      if (editing == null) {
        const pwd = password.trim();
        if (pwd.length < 6) {
          toast.error('La contraseña debe tener al menos 6 caracteres.');
          return;
        }
        addUser({
          id: generateUserId(),
          nombre: nombre.trim(),
          correo: correo.trim(),
          username: username.trim(),
          password: pwd,
          empresa: empresa.trim(),
          role: effectiveRole,
          superUser,
          deviceAccess: access.length ? access : ['all'],
          deviceNames,
        });
        toast.success('Usuario creado.');
      } else {
        if (editing.superUser === true && superUser === false) {
          if (countSuperUsers(getUsers()) <= 1) {
            toast.error('No puede dejar sin superusuario al sistema.');
            return;
          }
        }
        const patch: Partial<User> = {
          nombre: nombre.trim(),
          correo: correo.trim(),
          username: username.trim(),
          empresa: empresa.trim(),
          role: effectiveRole,
          superUser,
          deviceAccess: access.length ? access : ['all'],
          deviceNames,
        };
        const np = password.trim();
        if (np.length >= 6) patch.password = np;
        else if (np.length > 0 && np.length < 6) {
          toast.error('La nueva contraseña debe tener al menos 6 caracteres (o déjelo vacío).');
          return;
        }
        updateUser(editing.id, patch);
        toast.success('Usuario actualizado.');
      }
      setDialogOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operación rechazada.');
    }
  };

  const handleDelete = (u: User) => {
    if (!window.confirm(`¿Eliminar al usuario ${u.username}?`)) return;
    try {
      deleteUser(u.id);
      toast.success('Usuario eliminado.');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se puede eliminar.');
    }
  };

  const submitResetPassword = () => {
    if (resetTarget == null) return;
    if (resetPass !== resetPass2) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    if (resetPass.trim().length < 6) {
      toast.error('Mínimo 6 caracteres.');
      return;
    }
    try {
      updateUser(resetTarget.id, { password: resetPass.trim() });
      toast.success('Contraseña restablecida.');
      setResetOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al restablecer.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground mt-1">
            Alta, edición, acceso por IMEI y restablecimiento de contraseñas (solo superusuario).
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4 mr-2" />
          Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directorio</CardTitle>
          <CardDescription>Todos los usuarios se almacenan en el navegador (localStorage).</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Super</TableHead>
                <TableHead>Acceso equipos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.correo || '—'}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.empresa || '—'}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>{u.superUser ? 'Sí' : 'No'}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm" title={formatDeviceAccess(u.deviceAccess)}>
                    {formatDeviceAccess(u.deviceAccess)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button type="button" size="sm" variant="ghost" aria-label="Editar" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label="Restablecer clave" onClick={() => openReset(u)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label="Eliminar" onClick={() => handleDelete(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
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
            <DialogTitle>{editing == null ? 'Nuevo usuario' : 'Editar usuario'}</DialogTitle>
            <DialogDescription>
              En edición puede dejar la contraseña en blanco si no la desea cambiar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Correo</Label>
              <Input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Usuario (login)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>Contraseña {editing == null ? '' : '(opcional)'}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Rol aplicado</Label>
              <Select disabled={superUser === true} value={role} onValueChange={(v: UserRole) => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={superUser === true} onCheckedChange={(c) => setSuperUser(Boolean(c))} />
              Superusuario (acceso total y esta pantalla de administración)
            </label>

            <div className="space-y-2">
              <Label>Equipos permitidos — IMEIs separados por coma, o texto “all”</Label>
              <Input value={deviceAccessRaw} onChange={(e) => setDeviceAccessRaw(e.target.value)} placeholder="all" />
            </div>

            <div className="space-y-2">
              <Label>Nombres por IMEI (opcional)</Label>
              <textarea
                className="flex min-h-[96px] w-full rounded-md border border-input bg-input-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                value={deviceNamesRaw}
                onChange={(e) => setDeviceNamesRaw(e.target.value)}
                placeholder={`866262034327402|Nombre amigable\n863576046886862|Otro`}
              />
              <p className="text-xs text-muted-foreground">Un par por línea: IMEI | etiqueta visible</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveDialog}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>Usuario: {resetTarget?.username ?? ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar</Label>
              <Input type="password" value={resetPass2} onChange={(e) => setResetPass2(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submitResetPassword}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
