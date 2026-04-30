import React, { useState } from 'react';
import { mockAlarms } from '../mockData';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Bell, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Alarmas() {
  const [alarms, setAlarms] = useState(mockAlarms);

  const totalAlarmas = alarms.length;
  const alarmasAtendidas = alarms.filter(a => a.atendida).length;
  const alarmasPorAtender = alarms.filter(a => !a.atendida).length;

  const handleToggleAtendida = (alarmId: string) => {
    setAlarms(alarms.map(alarm => 
      alarm.id === alarmId 
        ? { ...alarm, atendida: !alarm.atendida }
        : alarm
    ));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alarmas</h1>
        <p className="text-gray-500 mt-1">Gestión de alertas del sistema</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Alarmas</CardTitle>
            <Bell className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlarmas}</div>
            <p className="text-xs text-gray-500 mt-1">Todas las alarmas registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alarmas Atendidas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{alarmasAtendidas}</div>
            <p className="text-xs text-gray-500 mt-1">Alarmas marcadas como leídas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Por Atender</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{alarmasPorAtender}</div>
            <p className="text-xs text-gray-500 mt-1">Alarmas pendientes de revisión</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Container ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Alarma</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Marcar como Atendida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alarms.map((alarm) => (
                <TableRow 
                  key={alarm.id}
                  className={alarm.atendida ? 'bg-gray-50' : ''}
                >
                  <TableCell>
                    {alarm.atendida ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{alarm.containerId}</TableCell>
                  <TableCell>{alarm.nombre}</TableCell>
                  <TableCell>
                    <span className={alarm.atendida ? 'text-gray-500' : 'font-medium'}>
                      {alarm.alarma}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(alarm.fecha)}</TableCell>
                  <TableCell>
                    {alarm.reportadaEmail ? (
                      <span className="text-green-600 text-sm">✓ Enviado</span>
                    ) : (
                      <span className="text-gray-400 text-sm">No enviado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={alarm.atendida}
                      onCheckedChange={() => handleToggleAtendida(alarm.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
