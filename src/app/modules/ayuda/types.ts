/** Contenido editable del módulo Ayuda y Soporte. */

export interface AyudaLinkItem {
  id: string;
  titulo: string;
  url: string;
  descripcion?: string;
}

export interface AyudaFaqItem {
  id: string;
  pregunta: string;
  respuesta: string;
}

export interface AyudaContacto {
  telefono: string;
  telefonoLabel: string;
  email: string;
  emailLabel: string;
  whatsapp: string;
  whatsappLabel: string;
}

export interface AyudaSistemaInfo {
  version: string;
  ultimaActualizacion: string;
  servidor: string;
  tiempoActividad: string;
  notas?: string;
}

export interface AyudaSoporteContent {
  contacto: AyudaContacto;
  documentacion: AyudaLinkItem[];
  videos: AyudaLinkItem[];
  faqs: AyudaFaqItem[];
  sistema: AyudaSistemaInfo;
  updatedAt?: string;
  updatedBy?: string;
}

export const LUPAMAPE_LINKEDIN =
  'https://www.linkedin.com/in/luis-pablo-marcelo-perea-606558b9/';

export function newAyudaId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultAyudaSoporteContent(): AyudaSoporteContent {
  return {
    contacto: {
      telefono: '+51 1 234 5679',
      telefonoLabel: 'Soporte 24/7',
      email: 'soporte@ztrack.com',
      emailLabel: 'Respuesta en 24 horas',
      whatsapp: '+51 987 654 321',
      whatsappLabel: 'Chat en vivo',
    },
    documentacion: [
      {
        id: 'doc-1',
        titulo: 'Manual de Usuario ZTRACK',
        url: '',
        descripcion: 'Guía general de la plataforma',
      },
      {
        id: 'doc-2',
        titulo: 'Guía de Instalación de Dispositivos',
        url: '',
      },
      {
        id: 'doc-3',
        titulo: 'Configuración de Alarmas',
        url: '',
      },
    ],
    videos: [
      {
        id: 'vid-1',
        titulo: 'Primeros Pasos con ZTRACK',
        url: '',
      },
      {
        id: 'vid-2',
        titulo: 'Cómo Configurar Alarmas',
        url: '',
      },
      {
        id: 'vid-3',
        titulo: 'Administración de Usuarios',
        url: '',
      },
    ],
    faqs: [
      {
        id: 'faq-1',
        pregunta: '¿Cómo veo la telemetría de un contenedor?',
        respuesta:
          'Abra Listado, localice el equipo y haga clic en la fila. En el detalle verá temperaturas en vivo, historial oficial, alarmas y (si tiene permiso) control o análisis. En Ayuda/Soporte revise el Manual por tipo de usuario.',
      },
      {
        id: 'faq-2',
        pregunta: '¿Qué significan los estados ONLINE, WAIT y OFFLINE?',
        respuesta:
          'ONLINE: transmitiendo en tiempo real. WAIT: sin transmisión reciente. OFFLINE: sin señal prolongada; revise conectividad del equipo.',
      },
      {
        id: 'faq-3',
        pregunta: '¿Cómo configuro alertas por email?',
        respuesta:
          'En Correo (admin/superadmin) cree grupos con destinatarios y equipos. El servidor envía alertas automáticamente según umbrales. Un admin tiene hasta 2 grupos y 3 correos por grupo.',
      },
      {
        id: 'faq-4',
        pregunta: '¿Por qué no veo datos de hace semanas?',
        respuesta:
          'Cada equipo tiene una fecha «Acceso desde» definida al asignarlo. Solo puede consultar telemetría, alarmas e incidentes desde esa fecha. Si el equipo ya estaba con el cliente, el admin puede retroceder esa fecha en Administración.',
      },
      {
        id: 'faq-5',
        pregunta: '¿Cómo descargo el historial de temperatura?',
        respuesta:
          'Abra el detalle del equipo y use las opciones CSV, Excel o PDF del historial oficial.',
      },
    ],
    sistema: {
      version: 'ZTRACK v2.4.1',
      ultimaActualizacion: 'Agosto 2026',
      servidor: 'Lima, Perú',
      tiempoActividad: '99.9%',
      notas: 'Plataforma de telemetría reefer / contenedores refrigerados.',
    },
  };
}
