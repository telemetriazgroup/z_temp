import React, { useState } from 'react';
import { mockAlarmConfigs, mockDevices, mockGroups } from '../mockData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Trash2, Eye } from 'lucide-react';
import type { AlarmConfig } from '../types';

export default function ConfiguracionAlarmas() {
  const [configs, setConfigs] = useState<AlarmConfig[]>(mockAlarmConfigs);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AlarmConfig | null>(null);

  // Form states
  const [containerId, setContainerId] = useState('all');
  const [tipo, setTipo] = useState<AlarmConfig['tipo']>('apagado');
  const [valor, setValor] = useState('');
  const [tiempo, setTiempo] = useState('');
  const [unidadTiempo, setUnidadTiempo] = useState<'horas' | 'minutos'>('horas');
  const [emails, setEmails] = useState('');

  const resetForm = () => {
    setContainerId('all');
    setTipo('apagado');
    setValor('');
    setTiempo('');
    setUnidadTiempo('horas');
    setEmails('');
    setEditingConfig(null);
  };

  const handleSave = () => {
    const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
    
    const newConfig: AlarmConfig = {
      id: editingConfig ? editingConfig.id : `config-${Date.now()}`,
      containerId,
      tipo,
      valor: valor ? parseFloat(valor) : undefined,
      tiempo: tiempo ? parseFloat(tiempo) : undefined,
      unidadTiempo,
      emails: emailList
    };

    if (editingConfig) {
      setConfigs(configs.map(c => c.id === editingConfig.id ? newConfig : c));
    } else {
      setConfigs([...configs, newConfig]);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleEdit = (config: AlarmConfig) => {
    setEditingConfig(config);
    setContainerId(config.containerId);
    setTipo(config.tipo);
    setValor(config.valor?.toString() || '');
    setTiempo(config.tiempo?.toString() || '');
    setUnidadTiempo(config.unidadTiempo || 'horas');
    setEmails(config.emails.join(', '));
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfigs(configs.filter(c => c.id !== id));
  };

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      'apagado': 'Apagado prolongado',
      'sin_transmitir': 'Sin transmitir',
      'temp_suministro_alta': 'Temperatura suministro alta',
      'temp_retorno_alta': 'Temperatura retorno alta',
      'temp_retorno_baja': 'Temperatura retorno baja'
    };
    return labels[tipo] || tipo;
  };

  const getContainerName = (id: string) => {
    if (id === 'all') return 'Todos los equipos';
    const device = mockDevices.find(d => d.containerId === id);
    return device ? `${device.containerId} (${device.nombre})` : id;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Alarmas</h1>
          <p className="text-gray-500 mt-1">Gestión de reglas de alertas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Configuración
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? 'Editar' : 'Nueva'} Configuración de Alarma
              </DialogTitle>
              <DialogDescription>
                Configure las reglas de alerta para contenedores o grupos
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Aplicar a</Label>
                <Select value={containerId} onValueChange={setContainerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los equipos</SelectItem>
                    {mockGroups.map(group => (
                      <SelectItem key={group.id} value={group.nombre}>
                        {group.nombre} (Grupo)
                      </SelectItem>
                    ))}
                    {mockDevices.slice(0, 10).map(device => (
                      <SelectItem key={device.id} value={device.containerId}>
                        {device.containerId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Tipo de Alarma</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as AlarmConfig['tipo'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apagado">Se mantiene apagado por tiempo</SelectItem>
                    <SelectItem value="sin_transmitir">Dejó de transmitir por tiempo</SelectItem>
                    <SelectItem value="temp_suministro_alta">Temperatura suministro superior a</SelectItem>
                    <SelectItem value="temp_retorno_alta">Temperatura retorno superior a</SelectItem>
                    <SelectItem value="temp_retorno_baja">Temperatura retorno inferior a</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(tipo === 'apagado' || tipo === 'sin_transmitir') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Tiempo</Label>
                    <Input
                      type="number"
                      value={tiempo}
                      onChange={(e) => setTiempo(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Unidad</Label>
                    <Select value={unidadTiempo} onValueChange={(v) => setUnidadTiempo(v as 'horas' | 'minutos')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horas">Horas</SelectItem>
                        <SelectItem value="minutos">Minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {(tipo === 'temp_suministro_alta' || tipo === 'temp_retorno_alta' || tipo === 'temp_retorno_baja') && (
                <div className="grid gap-2">
                  <Label>Valor (°C)</Label>
                  <Input
                    type="number"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0"
                    step="0.1"
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label>Correos destinatarios (separados por coma)</Label>
                <Input
                  type="text"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="correo1@example.com, correo2@example.com"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingConfig ? 'Actualizar' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alarmas Configuradas</CardTitle>
          <CardDescription>
            Lista de todas las configuraciones activas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aplicado a</TableHead>
                <TableHead>Tipo de Alarma</TableHead>
                <TableHead>Parámetros</TableHead>
                <TableHead>Destinatarios</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">
                    {getContainerName(config.containerId)}
                  </TableCell>
                  <TableCell>{getTipoLabel(config.tipo)}</TableCell>
                  <TableCell>
                    {config.valor && `${config.valor}°C`}
                    {config.tiempo && `${config.tiempo} ${config.unidadTiempo}`}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {config.emails.slice(0, 2).join(', ')}
                      {config.emails.length > 2 && ` +${config.emails.length - 2}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(config)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(config.id)}
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
    </div>
  );
}
