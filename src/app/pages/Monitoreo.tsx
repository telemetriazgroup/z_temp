import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { mockDevices, generateHistoricalData } from '../mockData';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Power, Thermometer, TrendingDown, Snowflake, CalendarIcon, Download, FileSpreadsheet, Image } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

type FilterType = 'all' | 'off' | 'on' | 'fuera_rango' | 'defrost';

export default function Monitoreo() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 24 * 3600000), // Últimas 24 horas por defecto
    to: new Date()
  });
  const [visibleLines, setVisibleLines] = useState({
    setpoint: true,
    suministro: true,
    retorno: true,
    evaporador: true
  });
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chartRef = useRef<SVGElement | null>(null);

  useEffect(() => {
    const deviceParam = searchParams.get('device');
    if (deviceParam) {
      setSelectedDevice(deviceParam);
      // Scroll to chart
      setTimeout(() => {
        document.getElementById('chart-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [searchParams]);

  const totalDevices = mockDevices.length;
  const offDevices = mockDevices.filter(d => d.power === 'OFF').length;
  const onDevices = mockDevices.filter(d => d.power === 'ON').length;
  const fueraRango = mockDevices.filter(d => !d.enRango).length;
  const defrostDevices = mockDevices.filter(d => d.defrost).length;

  const getFilteredDevices = () => {
    let filtered = mockDevices;

    switch (filter) {
      case 'off':
        filtered = mockDevices.filter(d => d.power === 'OFF');
        break;
      case 'on':
        filtered = mockDevices.filter(d => d.power === 'ON');
        break;
      case 'fuera_rango':
        filtered = mockDevices.filter(d => !d.enRango);
        break;
      case 'defrost':
        filtered = mockDevices.filter(d => d.defrost);
        break;
    }

    if (searchTerm) {
      filtered = filtered.filter(device => {
        const search = searchTerm.toLowerCase();
        return (
          device.containerId.toLowerCase().includes(search) ||
          device.nombre.toLowerCase().includes(search) ||
          device.booking.toLowerCase().includes(search)
        );
      });
    }

    return filtered;
  };

  const filteredDevices = getFilteredDevices();

  const handleDeviceClick = (deviceId: string) => {
    setSelectedDevice(deviceId);
    navigate(`/monitoreo?device=${deviceId}`);
    setTimeout(() => {
      document.getElementById('chart-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const selectedDeviceData = selectedDevice 
    ? mockDevices.find(d => d.id === selectedDevice)
    : null;

  const chartData = selectedDevice && dateRange.from && dateRange.to
    ? generateHistoricalData(selectedDevice, dateRange.from, dateRange.to)
    : [];

  const handleQuickDateRange = (hours: number) => {
    setDateRange({
      from: new Date(Date.now() - hours * 3600000),
      to: new Date()
    });
  };

  const handleLegendClick = (dataKey: string) => {
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev]
    }));
  };

  const exportToCSV = () => {
    if (!chartData || chartData.length === 0) return;

    // Crear encabezados CSV
    const headers = ['Fecha y Hora', 'Setpoint (°C)', 'Suministro (°C)', 'Retorno (°C)', 'Evaporador (°C)'];
    
    // Crear filas de datos
    const rows = chartData.map(row => [
      new Date(row.timestamp).toLocaleString('es-ES'),
      row.setpoint.toFixed(2),
      row.suministro.toFixed(2),
      row.retorno.toFixed(2),
      row.evaporador.toFixed(2)
    ]);

    // Combinar encabezados y filas
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Crear y descargar archivo
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temperaturas_${selectedDeviceData?.nombre}_${format(dateRange.from!, 'yyyy-MM-dd', { locale: es })}_${format(dateRange.to!, 'yyyy-MM-dd', { locale: es })}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportChartAsImage = () => {
    const chartElement = document.querySelector('#chart-section .recharts-surface');
    if (!chartElement) return;

    // Crear un canvas temporal
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Obtener dimensiones del gráfico
    const svgElement = chartElement as SVGSVGElement;
    const bbox = svgElement.getBoundingClientRect();
    canvas.width = bbox.width * 2; // Mayor resolución
    canvas.height = bbox.height * 2;
    ctx.scale(2, 2);

    // Convertir SVG a imagen
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new window.Image();
    img.onload = () => {
      // Fondo blanco
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2);
      
      // Dibujar imagen
      ctx.drawImage(img, 0, 0);
      
      // Descargar como PNG
      canvas.toBlob((blob) => {
        if (blob) {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `grafica_${selectedDeviceData?.nombre}_${format(dateRange.from!, 'yyyy-MM-dd', { locale: es })}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
        }
      });
      
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Monitoreo de Equipos</h1>
        <p className="text-gray-500 mt-1">Visualización en tiempo real</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-shadow ${filter === 'all' ? 'ring-2 ring-blue-600' : ''}`}
          onClick={() => setFilter('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equipos</CardTitle>
            <Thermometer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDevices}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover:shadow-lg transition-shadow ${filter === 'off' ? 'ring-2 ring-blue-600' : ''}`}
          onClick={() => setFilter('off')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apagados</CardTitle>
            <Power className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{offDevices}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover:shadow-lg transition-shadow ${filter === 'on' ? 'ring-2 ring-blue-600' : ''}`}
          onClick={() => setFilter('on')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encendidos</CardTitle>
            <Power className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onDevices}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover:shadow-lg transition-shadow ${filter === 'fuera_rango' ? 'ring-2 ring-blue-600' : ''}`}
          onClick={() => setFilter('fuera_rango')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuera de Rango</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fueraRango}</div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer hover:shadow-lg transition-shadow ${filter === 'defrost' ? 'ring-2 ring-blue-600' : ''}`}
          onClick={() => setFilter('defrost')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Defrost</CardTitle>
            <Snowflake className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{defrostDevices}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div>
        <Input
          type="text"
          placeholder="Buscar por Container ID, Nombre o Booking..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Container ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Temp. Setpoint</TableHead>
                <TableHead>Temp. Suministro</TableHead>
                <TableHead>Temp. Retorno</TableHead>
                <TableHead>Temp. Evaporador</TableHead>
                <TableHead>Temp. Compresor</TableHead>
                <TableHead>Setpoint CO₂</TableHead>
                <TableHead>CO₂</TableHead>
                <TableHead>Setpoint O₂</TableHead>
                <TableHead>O₂</TableHead>
                <TableHead>USDA1</TableHead>
                <TableHead>USDA2</TableHead>
                <TableHead>USDA3</TableHead>
                <TableHead>USDA4</TableHead>
                <TableHead>KW</TableHead>
                <TableHead>Última Conexión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow 
                  key={device.id}
                  className={selectedDevice === device.id ? 'bg-blue-50' : ''}
                >
                  <TableCell 
                    className="font-medium cursor-pointer hover:text-blue-600"
                    onDoubleClick={() => handleDeviceClick(device.id)}
                  >
                    {device.containerId}
                  </TableCell>
                  <TableCell 
                    className="cursor-pointer hover:text-blue-600"
                    onDoubleClick={() => handleDeviceClick(device.id)}
                  >
                    {device.nombre}
                  </TableCell>
                  <TableCell>{device.booking}</TableCell>
                  <TableCell>{device.temperaturaSetpoint.toFixed(1)}°C</TableCell>
                  <TableCell>
                    <Badge variant={device.enRango ? 'default' : 'destructive'}>
                      {device.temperaturaSuministro.toFixed(1)}°C
                    </Badge>
                  </TableCell>
                  <TableCell>{device.temperaturaRetorno.toFixed(1)}°C</TableCell>
                  <TableCell>{device.temperaturaEvaporador.toFixed(1)}°C</TableCell>
                  <TableCell>{device.temperaturaCompresor.toFixed(1)}°C</TableCell>
                  <TableCell>{device.setpointCo2.toFixed(1)}%</TableCell>
                  <TableCell>{device.co2.toFixed(1)}%</TableCell>
                  <TableCell>{device.setpointO2.toFixed(1)}%</TableCell>
                  <TableCell>{device.o2.toFixed(1)}%</TableCell>
                  <TableCell>{device.usda1.toFixed(1)}</TableCell>
                  <TableCell>{device.usda2.toFixed(1)}</TableCell>
                  <TableCell>{device.usda3.toFixed(1)}</TableCell>
                  <TableCell>{device.usda4.toFixed(1)}</TableCell>
                  <TableCell>{device.medidorKW.toFixed(2)} kW</TableCell>
                  <TableCell className="text-sm">{formatDate(device.ultimaConexion)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Chart Section */}
      {selectedDeviceData && (
        <div id="chart-section" className="border rounded-lg p-6 bg-white space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-2xl font-bold">
              Gráfica de Temperaturas - {selectedDeviceData.nombre}
            </h2>
            
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Quick date range buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDateRange(24)}
                >
                  24h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDateRange(48)}
                >
                  48h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDateRange(72)}
                >
                  3 días
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDateRange(168)}
                >
                  7 días
                </Button>
              </div>

              {/* Date range picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd MMM", { locale: es })} - {format(dateRange.to, "dd MMM yyyy", { locale: es })}
                        </>
                      ) : (
                        format(dateRange.from, "dd MMM yyyy", { locale: es })
                      )
                    ) : (
                      <span>Seleccionar fechas</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="p-3 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Desde:</Label>
                      <Calendar
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                        disabled={(date) => date > new Date()}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Hasta:</Label>
                      <Calendar
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                        disabled={(date) => 
                          date > new Date() || (dateRange.from ? date < dateRange.from : false)
                        }
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            Mostrando {chartData.length} puntos de datos
          </div>

          {/* Custom Legend */}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => handleLegendClick('setpoint')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                visibleLines.setpoint 
                  ? 'bg-purple-50 border-purple-300' 
                  : 'bg-gray-100 border-gray-300 opacity-50'
              }`}
            >
              <div className={`w-4 h-1 rounded ${visibleLines.setpoint ? 'bg-purple-600' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium">Setpoint</span>
            </button>
            <button
              onClick={() => handleLegendClick('suministro')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                visibleLines.suministro 
                  ? 'bg-blue-50 border-blue-300' 
                  : 'bg-gray-100 border-gray-300 opacity-50'
              }`}
            >
              <div className={`w-4 h-1 rounded ${visibleLines.suministro ? 'bg-blue-600' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium">Suministro</span>
            </button>
            <button
              onClick={() => handleLegendClick('retorno')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                visibleLines.retorno 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-gray-100 border-gray-300 opacity-50'
              }`}
            >
              <div className={`w-4 h-1 rounded ${visibleLines.retorno ? 'bg-green-600' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium">Retorno</span>
            </button>
            <button
              onClick={() => handleLegendClick('evaporador')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                visibleLines.evaporador 
                  ? 'bg-orange-50 border-orange-300' 
                  : 'bg-gray-100 border-gray-300 opacity-50'
              }`}
            >
              <div className={`w-4 h-1 rounded ${visibleLines.evaporador ? 'bg-orange-600' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium">Evaporador</span>
            </button>
          </div>

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} ref={chartRef}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    const hoursDiff = (dateRange.to!.getTime() - dateRange.from!.getTime()) / 3600000;
                    if (hoursDiff <= 48) {
                      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    } else {
                      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                    }
                  }}
                />
                <YAxis label={{ value: 'Temperatura (°C)', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleString('es-ES')}
                  formatter={(value: number) => [`${value.toFixed(2)}°C`, '']}
                />
                {visibleLines.setpoint && <Line type="monotone" dataKey="setpoint" stroke="#8b5cf6" name="Setpoint" strokeWidth={2} />}
                {visibleLines.suministro && <Line type="monotone" dataKey="suministro" stroke="#3b82f6" name="Suministro" strokeWidth={2} />}
                {visibleLines.retorno && <Line type="monotone" dataKey="retorno" stroke="#10b981" name="Retorno" strokeWidth={2} />}
                {visibleLines.evaporador && <Line type="monotone" dataKey="evaporador" stroke="#f59e0b" name="Evaporador" strokeWidth={2} />}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar a CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportChartAsImage}
            >
              <Image className="mr-2 h-4 w-4" />
              Exportar como Imagen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}