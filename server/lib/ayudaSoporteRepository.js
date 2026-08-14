import { readJson, writeJson } from './store.js';

const FILE = 'ayuda_soporte.json';

/** Default embebido (evita import TS en runtime Node). */
function builtInDefault() {
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
        pregunta: '¿Cómo agrego un nuevo dispositivo al sistema?',
        respuesta:
          'Vaya a Listado para ver los equipos conectados. Los dispositivos aparecen automáticamente al transmitir telemetría.',
      },
      {
        id: 'faq-2',
        pregunta: '¿Qué significan los estados ONLINE, WAIT y OFFLINE?',
        respuesta:
          'ONLINE: transmitiendo en tiempo real. WAIT: sin transmisión reciente. OFFLINE: sin señal prolongada.',
      },
      {
        id: 'faq-3',
        pregunta: '¿Cómo configuro alertas por email?',
        respuesta:
          'En Correo (admin/superadmin) cree grupos con destinatarios y equipos. El servidor envía alertas automáticamente.',
      },
      {
        id: 'faq-4',
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

function normalize(raw) {
  const base = builtInDefault();
  if (raw == null || typeof raw !== 'object') return base;
  return {
    contacto: { ...base.contacto, ...(raw.contacto ?? {}) },
    documentacion: Array.isArray(raw.documentacion)
      ? raw.documentacion
      : base.documentacion,
    videos: Array.isArray(raw.videos) ? raw.videos : base.videos,
    faqs: Array.isArray(raw.faqs) ? raw.faqs : base.faqs,
    sistema: { ...base.sistema, ...(raw.sistema ?? {}) },
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

export function getAyudaSoporte() {
  const raw = readJson(FILE, null);
  if (raw == null) {
    const initial = builtInDefault();
    writeJson(FILE, initial);
    return initial;
  }
  return normalize(raw);
}

export function saveAyudaSoporte(input, actorUsername) {
  const next = normalize(input);
  next.updatedAt = new Date().toISOString();
  next.updatedBy = actorUsername || 'superadmin';
  writeJson(FILE, next);
  return next;
}
