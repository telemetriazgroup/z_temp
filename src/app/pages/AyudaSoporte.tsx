import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Button } from '../components/ui/button';
import { Mail, Phone, MessageCircle, FileText, Video, HelpCircle } from 'lucide-react';

export default function AyudaSoporte() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ayuda y Soporte</h1>
        <p className="text-gray-500 mt-1">Centro de ayuda y recursos</p>
      </div>

      {/* Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-600" />
              Teléfono
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-2">Soporte 24/7</p>
            <p className="font-medium">+51 1 234 5679</p>
            <Button className="w-full mt-4" variant="outline">
              Llamar Ahora
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-2">Respuesta en 24 horas</p>
            <p className="font-medium">soporte@ztrack.com</p>
            <Button className="w-full mt-4" variant="outline">
              Enviar Email
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-2">Chat en vivo</p>
            <p className="font-medium">+51 987 654 321</p>
            <Button className="w-full mt-4" variant="outline">
              Abrir Chat
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentación
            </CardTitle>
            <CardDescription>Manuales y guías de usuario</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="ghost" className="w-full justify-start">
              → Manual de Usuario ZTRACK
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → Guía de Instalación de Dispositivos
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → Configuración de Alarmas
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → API Documentation
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Tutoriales en Video
            </CardTitle>
            <CardDescription>Aprende paso a paso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="ghost" className="w-full justify-start">
              → Primeros Pasos con ZTRACK
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → Cómo Configurar Alarmas
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → Interpretación de Gráficos
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              → Administración de Usuarios
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Preguntas Frecuentes
          </CardTitle>
          <CardDescription>Respuestas a las dudas más comunes</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                ¿Cómo agrego un nuevo dispositivo al sistema?
              </AccordionTrigger>
              <AccordionContent>
                Vaya a Administración → Dispositivos → Agregar Reefer. Necesitará el Container ID,
                Booking y Código de seguridad proporcionado por el fabricante. Una vez registrado,
                el dispositivo comenzará a transmitir datos automáticamente.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>
                ¿Qué significan los estados ONLINE, WAIT y OFFLINE?
              </AccordionTrigger>
              <AccordionContent>
                ONLINE: El dispositivo está transmitiendo datos en tiempo real.
                WAIT: El dispositivo no ha transmitido en los últimos 15 minutos.
                OFFLINE: Sin transmisión por más de 1 hora. Puede indicar un problema de conectividad.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>
                ¿Cómo configuro alertas por email?
              </AccordionTrigger>
              <AccordionContent>
                Vaya a Configuración de Alarmas, cree una nueva configuración seleccionando el tipo
                de alerta (temperatura, tiempo sin transmitir, etc.) y agregue los correos destinatarios
                separados por comas. Las alertas se enviarán automáticamente cuando se cumplan las condiciones.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>
                ¿Qué es el modo Defrost y cuánto tiempo dura?
              </AccordionTrigger>
              <AccordionContent>
                El modo Defrost es un ciclo de descongelación automática del evaporador. Durante este proceso,
                la temperatura puede subir temporalmente. Típicamente dura entre 15-45 minutos dependiendo
                del modelo del equipo. Es un proceso normal y necesario para el funcionamiento óptimo.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>
                ¿Cómo descargo los datos históricos de temperatura?
              </AccordionTrigger>
              <AccordionContent>
                En la vista de Monitoreo, haga doble clic en el dispositivo deseado para ver su gráfica.
                En la esquina superior derecha de la gráfica encontrará opciones para exportar los datos
                en formato CSV o PDF para análisis posterior.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6">
              <AccordionTrigger>
                ¿Puedo crear grupos de contenedores?
              </AccordionTrigger>
              <AccordionContent>
                Sí, vaya a Administración → Grupos donde puede crear, editar y eliminar grupos.
                Los grupos facilitan la gestión de múltiples contenedores y permiten configurar
                alarmas para todo el grupo a la vez.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Versión:</span>
              <span className="ml-2 font-medium">ZTRACK v2.4.1</span>
            </div>
            <div>
              <span className="text-gray-600">Última Actualización:</span>
              <span className="ml-2 font-medium">Marzo 2026</span>
            </div>
            <div>
              <span className="text-gray-600">Servidor:</span>
              <span className="ml-2 font-medium">Lima, Perú</span>
            </div>
            <div>
              <span className="text-gray-600">Tiempo de Actividad:</span>
              <span className="ml-2 font-medium">99.9%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
