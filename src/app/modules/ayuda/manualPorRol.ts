/**
 * Manual didáctico precargado por tipo de usuario.
 * Fuente de verdad narrativa: /Ayuda_usuario.md
 */

export type ManualRole = 'superadmin' | 'admin' | 'monitoreo';

export interface ManualSection {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  example?: string;
  tips?: string[];
}

export interface ManualRoleGuide {
  role: ManualRole;
  label: string;
  intro: string;
  sections: ManualSection[];
}

export function resolveManualRole(params: {
  superUser?: boolean;
  category?: string | null;
}): ManualRole {
  if (params.superUser === true || params.category === 'superadmin') {
    return 'superadmin';
  }
  if (params.category === 'admin') return 'admin';
  return 'monitoreo';
}

const FLUJO_LISTADO_DETALLE: ManualSection = {
  id: 'flujo-listado-detalle',
  title: 'Dinámica: Listado → telemetría del equipo',
  summary:
    'El camino principal para ver un contenedor es siempre Listado y luego su detalle. Ahí están el estatus en vivo, el historial oficial, alarmas del reefer y (si tiene permiso) control o análisis.',
  steps: [
    'En el menú abra Listado. Verá la flota que tiene asignada (no la de otros clientes).',
    'Use búsqueda o filtros (ONLINE / WAIT / OFFLINE, en rango / fuera de rango) para ubicar el equipo.',
    'Haga clic en la fila del equipo. Se abre /listado/detalle con IMEI y origen (TUNEL, STARCOOL, etc.).',
    'En el detalle: revise temperaturas, setpoint, estado de conexión y alarmas activas.',
    'Desplácese al historial oficial: elija fechas y pulse Buscar. Si su acceso al equipo empieza en una fecha, no verá datos anteriores.',
    'Si el superadmin le habilitó Análisis de telemetría, aparece el panel bajo el historial. Si le habilitó Control de temperaturas (equipos TUNEL), verá el panel de comandos.',
  ],
  example:
    'Ejemplo: en Inicio pulsa la tarjeta «Fuera de rango» → Listado filtrado → abre ZGRU9014275 → historial de las últimas horas → exporta CSV para el cliente.',
  tips: [
    'Inicio también enlaza a detalle desde «Últimos equipos con alarmas» o «Más tiempo fuera de línea».',
    'Sin equipos asignados verá un aviso; puede ir a Ayuda o Perfil, pero no a Listado/Inicio con datos.',
  ],
};

export const MANUAL_POR_ROL: Record<ManualRole, ManualRoleGuide> = {
  monitoreo: {
    role: 'monitoreo',
    label: 'Usuario de monitoreo',
    intro:
      'Su cuenta está orientada a operar y vigilar la flota asignada: ver temperaturas, historial, alarmas del equipo e incidentes de correo. No administra usuarios ni configura grupos de alerta.',
    sections: [
      {
        id: 'inicio',
        title: 'Inicio',
        summary:
          'Resumen de su flota: cuántos equipos online/wait/offline, en rango o fuera de rango, y extractos urgentes (alarmas, correos, fuera de línea).',
        steps: [
          'Al entrar verá el logo ZTRACK cargando datos («Vinculando…» / «Integrando…»).',
          'Pulse una tarjeta KPI (por ejemplo Offline) para ir al Listado ya filtrado.',
          'Revise «Últimos equipos con alarmas» y abra el detalle si necesita investigar.',
        ],
        example:
          'Si «Más tiempo fuera de línea» muestra un IMEI, ábralo y confirme la última transmisión en el detalle.',
        tips: [
          'Solo ve datos desde la fecha en que le asignaron cada equipo.',
        ],
      },
      FLUJO_LISTADO_DETALLE,
      {
        id: 'alarmas',
        title: 'Alarmas',
        summary:
          'Eventos tomados de la telemetría (código de alarma del controlador) enlazados al catálogo MP4000.',
        steps: [
          'Abra Alarmas para ver eventos activos o recientes de sus equipos.',
          'Marque como atendida cuando ya revisó el caso en campo o con el cliente.',
          'Los textos amigables vienen del catálogo; el detalle técnico completo lo ven admin/superadmin.',
        ],
        example:
          'Aparece alarma de sensor de retorno → abre el equipo en Listado → confirma return air anómalo en el gráfico.',
      },
      {
        id: 'incidentes',
        title: 'Incidentes de correo',
        summary:
          'Bandeja de episodios que el sistema de correo ya notificó (fuera de rango, offline, etc.) sobre equipos de grupos donde usted participa.',
        steps: [
          'Filtre por pendiente / atendida.',
          'Lea el asunto, umbral y horario; deje un comentario si aplica.',
          'Marque atendida cuando el episodio quedó resuelto.',
        ],
        tips: [
          'Si no tiene equipos en grupos de correo activos, la bandeja puede estar vacía aunque vea Listado.',
        ],
      },
      {
        id: 'perfil-ayuda',
        title: 'Perfil y Ayuda',
        summary: 'Ajustes personales y contacto de soporte; siempre disponibles aunque no tenga flota.',
        steps: [
          'En Perfil cambie contraseña, zona horaria, unidad °C/°F e idioma.',
          'En Ayuda/Soporte use teléfono, correo o WhatsApp y lea esta guía.',
        ],
      },
    ],
  },

  admin: {
    role: 'admin',
    label: 'Administrador',
    intro:
      'Además de monitorear su flota, gestiona los usuarios que usted crea, asigna equipos (dentro de lo que el superadmin le autorizó) y configura correo/alertas. No puede crear grupos de IMEI de flota ni otorgar permisos que el superadmin no le dio.',
    sections: [
      {
        id: 'inicio-listado',
        title: 'Inicio y Listado',
        summary: 'Igual que monitoreo, pero sobre toda su flota autorizada (grupos + IMEI directos).',
        steps: [
          'Use Inicio como tablero operativo del cliente.',
          'Listado → detalle es la vía para telemetría, historial y paneles especiales.',
        ],
        tips: [
          'Control de temperaturas y Análisis de telemetría solo aparecen si el superadmin se los habilitó a usted (y luego usted a sus usuarios).',
        ],
      },
      FLUJO_LISTADO_DETALLE,
      {
        id: 'usuarios',
        title: 'Usuarios',
        summary: 'Alta de cuentas de monitoreo bajo su cuota (por defecto 3).',
        steps: [
          'Cree el usuario con datos personales y contraseña.',
          'Active Control / Análisis solo si usted mismo los tiene.',
          'No escriba IMEI aquí: la flota se asigna en Administración.',
        ],
        example:
          'Crea «monitoreo.ransa» → va a Administración → marca grupo Monitoreo RANSA → pone Acceso desde 18/08/2026 → Guardar.',
      },
      {
        id: 'administracion',
        title: 'Administración (asignaciones)',
        summary:
          'Asigna grupos o IMEI a sus usuarios y define desde qué fecha ven datos históricos.',
        steps: [
          'Seleccione el usuario en la lista.',
          'Marque grupos y/o equipos individuales de su flota.',
          'Indique «Acceso a datos desde» (por defecto hoy). Puede retroceder la fecha si el equipo ya estaba con el cliente.',
          'Guarde. Puede dejar sin equipos (el usuario verá aviso de flota vacía).',
        ],
        tips: [
          'Si reasigna el mismo IMEI, la fecha nueva corta el historial anterior para esa cuenta.',
          'Solo el superadmin crea o edita la composición de grupos e IMEI.',
        ],
      },
      {
        id: 'correo',
        title: 'Correo y alertas',
        summary:
          'Hasta 2 grupos y 3 correos por grupo. Envío automático cada ~2 minutos.',
        steps: [
          'Cree un grupo, agregue destinatarios y equipos de su flota.',
          'Defina umbrales (horas fuera de rango) en el grupo.',
          'En «Alertas por equipo» personalice márgenes o alertas 30 min / 1 h si lo necesita.',
          'Revise «Registro de envíos» e «Incidentes correo».',
        ],
        example:
          'Grupo «Monitoreo RANSA» con 2 correos → equipo fuera de rango 2 h → correo automático → incidente pendiente.',
        tips: [
          'Al reasignar un IMEI, la personalización de alertas del cliente anterior no se hereda.',
        ],
      },
      {
        id: 'alarmas-catalogo',
        title: 'Alarmas y Catálogo',
        summary: 'Alarmas operativas + consulta/edición del catálogo MP4000.',
        steps: [
          'Alarmas: gestione eventos de sus equipos.',
          'Catálogo: busque códigos y mensajes; puede editar fichas si es gestor.',
        ],
      },
    ],
  },

  superadmin: {
    role: 'superadmin',
    label: 'Superadministrador',
    intro:
      'Acceso completo: flota global, empresas, grupos e IMEI, correo sin cupos, auditorías, análisis de señal y edición de Ayuda/Soporte. Define quién ve qué y desde cuándo.',
    sections: [
      {
        id: 'gobernanza',
        title: 'Gobernanza de flota y cuentas',
        summary: 'Empresas → Grupos de IMEI → Asignación a admins/usuarios → permisos especiales.',
        steps: [
          'Empresas: catálogo de clientes / razón social.',
          'Administración → Grupos: cree grupos e IMEI (solo usted).',
          'Administración → Asignaciones: dé flota a un admin o usuario y fije «Acceso desde».',
          'Usuarios: cree admins (cuota maxManagedUsers) y active Control / Análisis según negocio.',
        ],
        example:
          'Cliente nuevo: empresa RANSA → grupo con 14 IMEI → asignar al admin RANSA con acceso desde el día de ingreso a patio → el admin crea 2 monitores.',
      },
      FLUJO_LISTADO_DETALLE,
      {
        id: 'correo-completo',
        title: 'Correo (SMTP, ciclos, limpieza)',
        summary: 'Configura remitente, ve ciclos de evaluación y limpia historiales.',
        steps: [
          'Pestaña Remitente: SMTP de envío.',
          'Grupos ilimitados; puede ejecutar ciclo «Ahora».',
          'Ciclos: diagnostique por qué se envió o no una alerta.',
          'Alertas por equipo: personalización por titular (owner).',
        ],
      },
      {
        id: 'auditoria-senal',
        title: 'Auditoría y Análisis de señal',
        summary: 'Trazabilidad de acciones y comportamiento de conectividad wait/offline.',
        steps: [
          'Control / Auditoría: comandos remotos (setpoint, defrost, stop).',
          'Auditoría usuarios: logins, vistas de detalle, descargas, CRUD.',
          'Análisis de señal: equipos por desconexión reciente, historial de rangos, telemetría y eventos.',
        ],
      },
      {
        id: 'modulos-adicionales',
        title: 'Monitoreo, Ubícanos, Config. alarmas',
        summary:
          'Pantallas adicionales del menú completo. Monitoreo/Ubícanos/Config. alarmas pueden incluir vistas de apoyo; la telemetría operativa real está en Listado → detalle y Correo.',
        steps: [
          'Monitoreo: gráficos históricos de apoyo.',
          'Ubícanos: ubicación / mapa (enlace desde detalle).',
          'Configuración Alarmas: reglas locales de apoyo (las alertas por email productivas están en Correo).',
        ],
      },
      {
        id: 'ayuda-edit',
        title: 'Ayuda/Soporte editable',
        summary: 'Edite contacto, FAQs y enlaces visibles para todos los roles.',
        steps: [
          'Abra Ayuda → Editar contenido → Guardar.',
          'El manual por rol de esta página se mantiene en código (Ayuda_usuario.md) como referencia didáctica.',
        ],
      },
    ],
  },
};

export const MANUAL_ROLES_ORDER: ManualRole[] = [
  'monitoreo',
  'admin',
  'superadmin',
];
