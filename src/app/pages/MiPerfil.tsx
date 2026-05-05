import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../AuthContext';
import { changeOwnPassword, getUserById, updateUser } from '../modules/usuario';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';

export default function MiPerfil() {
  const { user, reloadUser } = useAuth();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [username, setUsername] = useState('');

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');

  useEffect(() => {
    if (user == null) return;
    const u = getUserById(user.id);
    if (u != null) {
      setNombre(u.nombre);
      setCorreo(u.correo);
      setEmpresa(u.empresa);
      setUsername(u.username);
    }
  }, [user]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (user == null) return;
    try {
      updateUser(user.id, { nombre: nombre.trim(), correo: correo.trim(), empresa: empresa.trim(), username: username.trim() });
      reloadUser();
      toast.success('Datos actualizados.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los datos.');
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (user == null) return;
    if (newPwd !== newPwd2) {
      toast.error('Las contraseñas nuevas no coinciden.');
      return;
    }
    try {
      changeOwnPassword(user.id, curPwd, newPwd);
      setCurPwd('');
      setNewPwd('');
      setNewPwd2('');
      reloadUser();
      toast.success('Contraseña actualizada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-3xl font-bold">Mi cuenta</h1>
        <p className="text-muted-foreground mt-1">
          Actualice su nombre, correo, empresa y usuario. Solo usted debe conocer su contraseña actual para cambiarla.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
          <CardDescription>Estos datos se guardan localmente en su navegador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pf-nombre">Nombre completo</Label>
              <Input id="pf-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-correo">Correo electrónico</Label>
              <Input id="pf-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-empresa">Empresa</Label>
              <Input id="pf-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-user">Nombre de usuario</Label>
              <Input id="pf-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <Button type="submit">Guardar cambios</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Debe indicar la contraseña actual.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pf-curr">Contraseña actual</Label>
              <Input
                id="pf-curr"
                type="password"
                autoComplete="current-password"
                value={curPwd}
                onChange={(e) => setCurPwd(e.target.value)}
                required
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="pf-np1">Nueva contraseña</Label>
              <Input id="pf-np1" type="password" autoComplete="new-password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-np2">Confirmar nueva contraseña</Label>
              <Input id="pf-np2" type="password" autoComplete="new-password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" variant="secondary">
              Actualizar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
