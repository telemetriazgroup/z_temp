import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { mockDevices } from '../mockData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { MapPin } from 'lucide-react';

export default function Ubicanos() {
  const [searchParams] = useSearchParams();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  useEffect(() => {
    if (lat && lng) {
      const device = mockDevices.find(
        d => Math.abs(d.ubicacion.lat - parseFloat(lat)) < 0.01 && 
             Math.abs(d.ubicacion.lng - parseFloat(lng)) < 0.01
      );
      if (device) setSelectedDevice(device.containerId);
    }
  }, [lat, lng]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ubicación de Dispositivos</h1>
        <p className="text-gray-500 mt-1">Mapa de localización de contenedores</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mapa de Ubicaciones</CardTitle>
            <CardDescription>
              Visualización geográfica de los dispositivos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
              <div className="text-center">
                <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Mapa Interactivo</p>
                <p className="text-sm text-gray-500 mt-2">
                  {lat && lng 
                    ? `Mostrando ubicación: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
                    : 'Seleccione un dispositivo de la lista para ver su ubicación'}
                </p>
                <p className="text-xs text-gray-400 mt-4">
                  Esta es una vista simulada. En producción se integraría con Google Maps o Mapbox.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Device List */}
        <Card>
          <CardHeader>
            <CardTitle>Dispositivos</CardTitle>
            <CardDescription>
              Lista de contenedores registrados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {mockDevices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => setSelectedDevice(device.containerId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedDevice === device.containerId
                      ? 'bg-blue-50 border-blue-600'
                      : 'hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{device.containerId}</div>
                      <div className="text-xs text-gray-600">{device.nombre}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {device.ubicacion.lat.toFixed(4)}, {device.ubicacion.lng.toFixed(4)}
                      </div>
                    </div>
                    <MapPin className={`h-4 w-4 ${
                      selectedDevice === device.containerId ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Información de Ubicación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">Oficina Principal</h3>
              <p className="text-sm text-gray-600">
                Av. Principal 123<br />
                Lima, Perú<br />
                Teléfono: +51 1 234 5678<br />
                Email: info@ztrack.com
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-2">Soporte Técnico</h3>
              <p className="text-sm text-gray-600">
                Disponible 24/7<br />
                Teléfono: +51 1 234 5679<br />
                Email: soporte@ztrack.com<br />
                WhatsApp: +51 987 654 321
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
