import React, { useState } from 'react';
import { Link } from 'react-router';
import { mockDevices, mockGroups } from '../mockData';
import { useAuth } from '../AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Trash2, Container, FolderTree, Edit } from 'lucide-react';
import type { Group } from '../types';

export default function Administracion() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>(mockGroups);
  const [devices, setDevices] = useState(mockDevices);

  // Group Dialog
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);

  // Add Device Dialog
  const [isAddDeviceDialogOpen, setIsAddDeviceDialogOpen] = useState(false);
  const [newContainerId, setNewContainerId] = useState('');
  const [newBooking, setNewBooking] = useState('');
  const [newSecurityCode, setNewSecurityCode] = useState('');

  // Rename Device Dialog
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameContainerId, setRenameContainerId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');

  // Group Management
  const handleSaveGroup = () => {
    if (editingGroup) {
      setGroups(groups.map(g => 
        g.id === editingGroup.id 
          ? { ...g, nombre: groupName, containerIds: selectedContainers }
          : g
      ));
    } else {
      const newGroup: Group = {
        id: `group-${Date.now()}`,
        nombre: groupName,
        containerIds: selectedContainers
      };
      setGroups([...groups, newGroup]);
    }
    setIsGroupDialogOpen(false);
    setGroupName('');
    setSelectedContainers([]);
    setEditingGroup(null);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupName(group.nombre);
    setSelectedContainers(group.containerIds);
    setIsGroupDialogOpen(true);
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups(groups.filter(g => g.id !== groupId));
  };

  // Device Management
  const handleAddDevice = () => {
    // Mock adding device
    alert(`Dispositivo ${newContainerId} agregado con éxito.\nBooking: ${newBooking}\nCódigo: ${newSecurityCode}`);
    setIsAddDeviceDialogOpen(false);
    setNewContainerId('');
    setNewBooking('');
    setNewSecurityCode('');
  };

  const handleRenameDevice = () => {
    setDevices(devices.map(d => 
      d.containerId === renameContainerId 
        ? { ...d, nombre: newDeviceName }
        : d
    ));
    setIsRenameDialogOpen(false);
    setRenameContainerId('');
    setNewDeviceName('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Administración</h1>
        <p className="text-gray-500 mt-1">Gestión de usuarios, grupos y dispositivos</p>
      </div>

      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="dispositivos">Dispositivos</TabsTrigger>
          <TabsTrigger value="renombrar">Renombrar</TabsTrigger>
        </TabsList>

        {/* USUARIOS TAB */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas del sistema</CardTitle>
              <CardDescription>
                La administración completa de usuarios (crear, editar, permisos por IMEI y
                superusuarios) está en el módulo dedicado.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4 items-start">
              {user?.superUser === true ? (
                <Button asChild>
                  <Link to="/usuarios">Abrir módulo Usuarios</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Solo un superusuario puede gestionar cuentas. Si necesita acceso, contacte al
                  administrador.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GRUPOS TAB */}
        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Gestión de Grupos</CardTitle>
                  <CardDescription>Crear y administrar grupos de contenedores</CardDescription>
                </div>
                <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setEditingGroup(null); setGroupName(''); setSelectedContainers([]); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo Grupo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingGroup ? 'Editar' : 'Crear'} Grupo
                      </DialogTitle>
                      <DialogDescription>
                        Configure el nombre y los contenedores del grupo
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Nombre del Grupo</Label>
                        <Input
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="Grupo A"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Contenedores (seleccione múltiples)</Label>
                        <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                          {devices.slice(0, 10).map((device) => (
                            <label key={device.id} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedContainers.includes(device.containerId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedContainers([...selectedContainers, device.containerId]);
                                  } else {
                                    setSelectedContainers(selectedContainers.filter(id => id !== device.containerId));
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="text-sm">{device.containerId} - {device.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveGroup}>
                        {editingGroup ? 'Actualizar' : 'Crear'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Cantidad de Contenedores</TableHead>
                    <TableHead>Contenedores</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="font-medium">{group.nombre}</TableCell>
                      <TableCell>{group.containerIds.length}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {group.containerIds.slice(0, 3).join(', ')}
                        {group.containerIds.length > 3 && ` +${group.containerIds.length - 3}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditGroup(group)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteGroup(group.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISPOSITIVOS TAB */}
        <TabsContent value="dispositivos">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Agregar Dispositivo</CardTitle>
                  <CardDescription>Registrar un nuevo contenedor reefer</CardDescription>
                </div>
                <Dialog open={isAddDeviceDialogOpen} onOpenChange={setIsAddDeviceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Reefer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agregar Nuevo Dispositivo</DialogTitle>
                      <DialogDescription>
                        Ingrese los datos del contenedor reefer
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Container ID</Label>
                        <Input
                          value={newContainerId}
                          onChange={(e) => setNewContainerId(e.target.value)}
                          placeholder="ZGRU2212229-1"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Booking</Label>
                        <Input
                          value={newBooking}
                          onChange={(e) => setNewBooking(e.target.value)}
                          placeholder="BK100001"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Código de Seguridad</Label>
                        <Input
                          type="password"
                          value={newSecurityCode}
                          onChange={(e) => setNewSecurityCode(e.target.value)}
                          placeholder="••••••"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDeviceDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddDevice}>Agregar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Use este apartado para registrar nuevos dispositivos reefer en el sistema.
                Se requiere el Container ID, Booking y Código de seguridad proporcionado por el fabricante.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RENOMBRAR TAB */}
        <TabsContent value="renombrar">
          <Card>
            <CardHeader>
              <CardTitle>Renombrar Contenedor</CardTitle>
              <CardDescription>Asignar un nombre personalizado a un contenedor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Seleccionar Contenedor</Label>
                  <Select value={renameContainerId} onValueChange={setRenameContainerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un contenedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.slice(0, 15).map((device) => (
                        <SelectItem key={device.id} value={device.containerId}>
                          {device.containerId} - {device.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {renameContainerId && (
                  <div className="grid gap-2">
                    <Label>Nuevo Nombre</Label>
                    <Input
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      placeholder="Ingrese el nuevo nombre"
                    />
                  </div>
                )}
                <Button 
                  onClick={handleRenameDevice}
                  disabled={!renameContainerId || !newDeviceName}
                >
                  Actualizar Nombre
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
