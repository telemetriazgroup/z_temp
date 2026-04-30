import React from 'react';
import { useNavigate } from 'react-router';
import { mockDevices, mockAlarms } from '../mockData';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Activity, Power, Bell, Mail, Snowflake, TrendingUp, TrendingDown } from 'lucide-react';

export default function Inicio() {
  const navigate = useNavigate();
  
  const onlineDevices = mockDevices.filter(d => d.status === 'ONLINE').length;
  const waitDevices = mockDevices.filter(d => d.status === 'WAIT').length;
  const offlineDevices = mockDevices.filter(d => d.status === 'OFFLINE').length;
  
  const onPowerDevices = mockDevices.filter(d => d.power === 'ON').length;
  const offPowerDevices = mockDevices.filter(d => d.power === 'OFF').length;
  
  const alarmsVistas = mockAlarms.filter(a => a.atendida).length;
  const alarmsNoVistas = mockAlarms.filter(a => !a.atendida).length;
  
  const alarmsEmail = mockAlarms.filter(a => a.reportadaEmail).length;
  
  const defrostDevices = mockDevices.filter(d => d.defrost).length;
  const enRangoDevices = mockDevices.filter(d => d.enRango).length;
  const fueraRangoDevices = mockDevices.filter(d => !d.enRango).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Box 1: Status de equipos */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/listado')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Estado de Equipos
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Online</span>
                <span className="text-2xl font-bold text-green-600">{onlineDevices}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Wait</span>
                <span className="text-2xl font-bold text-yellow-600">{waitDevices}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Offline</span>
                <span className="text-2xl font-bold text-red-600">{offlineDevices}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Box 2: Power de equipos */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/listado')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Power de Equipos
            </CardTitle>
            <Power className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Encendidos</span>
                <span className="text-2xl font-bold text-green-600">{onPowerDevices}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Apagados</span>
                <span className="text-2xl font-bold text-gray-600">{offPowerDevices}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Box 3: Alarmas */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/alarmas')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Alarmas
            </CardTitle>
            <Bell className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Vistas</span>
                <span className="text-2xl font-bold text-green-600">{alarmsVistas}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Por Atender</span>
                <span className="text-2xl font-bold text-red-600">{alarmsNoVistas}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Box 4: Alarmas por Email */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/alarmas')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Reportes Email
            </CardTitle>
            <Mail className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{alarmsEmail}</div>
            <p className="text-xs text-gray-500 mt-1">
              Alarmas reportadas por correo
            </p>
          </CardContent>
        </Card>

        {/* Box 5: Defrost */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/monitoreo')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Defrost
            </CardTitle>
            <Snowflake className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{defrostDevices}</div>
            <p className="text-xs text-gray-500 mt-1">
              Equipos en defrost
            </p>
          </CardContent>
        </Card>

        {/* Box 6: En Rango */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/monitoreo')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              En Rango
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{enRangoDevices}</div>
            <p className="text-xs text-gray-500 mt-1">
              Equipos en rango
            </p>
          </CardContent>
        </Card>

        {/* Box 7: Fuera de Rango */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/monitoreo')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Fuera de Rango
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{fueraRangoDevices}</div>
            <p className="text-xs text-gray-500 mt-1">
              Equipos fuera de rango
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
