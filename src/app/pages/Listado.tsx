import React from 'react';
import { useNavigate } from 'react-router';
import { mockDevices } from '../mockData';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';

export default function Listado() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Listado de equipos</h1>
        <p className="text-gray-500 mt-1">Vista rápida de contenedores y estado</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Container ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Power</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDevices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.containerId}</TableCell>
                  <TableCell>{d.nombre}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === 'OFFLINE' ? 'destructive' : 'secondary'}>{d.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.power === 'ON' ? 'default' : 'outline'}>{d.power}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/monitoreo?device=${d.id}`)}>
                      Ver gráficas
                    </Button>
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
