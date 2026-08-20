# Ayuda de usuario ZTRACK

Documento de referencia para precargar y mantener el manual didáctico en **Ayuda/Soporte** (`src/app/modules/ayuda/manualPorRol.ts`).  
Plataforma: monitoreo de temperaturas en contenedores refrigerados (reefer) — telemetría TUNEL / STARCOOL / STARCOOL2 / TERMOKING.

Última actualización de contenido: agosto 2026.

---

## 1. Roles

| Rol | Quién es | Menú típico |
|-----|----------|-------------|
| **Superadmin** | Operación ZTRACK / plataforma | Todo: flota global, empresas, grupos IMEI, correo completo, auditorías, análisis de señal, ayuda editable |
| **Admin** | Cliente o jefe de monitoreo | Inicio, Listado, Administración (asignar), Usuarios (cuota), Correo (cupos), Alarmas, Catálogo, Incidentes, Ayuda, Perfil |
| **Monitoreo** | Operador de piso / turno | Inicio, Listado, Alarmas, Incidentes correo, Ayuda, Perfil |

Reglas transversales:

- Un **admin no transfiere** `puedeControlTemperatura` ni `puedeAnalisisTelemetria` si el superadmin no se los otorgó a él.
- La flota se asigna en **Administración**, no escribiendo IMEI libres en Usuarios.
- **Fecha «Acceso desde»** por IMEI: si no se indica, se usa el día de asignación. Corta historial, alarmas, incidentes, envíos y resúmenes de Inicio.
- Sin flota efectiva: aviso `SinEquiposAsignados`; siguen útiles Ayuda y Perfil (y admin: Usuarios / Administración).

---

## 2. Dinámica principal: Listado → telemetría

1. **Listado** muestra la flota viva (estado, setpoint, return air, en rango, alarmas, nombre).
2. Clic en fila → **`/listado/detalle?imei=&codigo=`**.
3. En detalle: estatus, alarmas del controlador, historial oficial (búsqueda por fechas), mapa (si aplica).
4. Paneles opcionales:
   - **Control de temperaturas** (TUNEL + permiso).
   - **Análisis de telemetría** (permiso + historial oficial).
5. Desde **Inicio**, las tarjetas KPI y listas urgentes llevan al Listado filtrado o al detalle.

Esta es la ruta real de telemetría. Otras pantallas (Monitoreo, Ubícanos, Config. alarmas) son de apoyo / menú ampliado para superadmin.

---

## 3. Módulos (referencia profunda)

### 3.1 Inicio (`/`)

- **Propósito:** tablero de flota (live + series semanales + urgentes).
- **Carga:** splash con logo del oso: «Vinculando nuevos datos…» (2 s) → «Integrando datos y analizando…».
- **Acciones:** refrescar; clic KPI → Listado filtrado; abrir detalle desde urgentes; superadmin: links API, equipos nuevos a revisar, actividad de usuarios.
- **Alcance:** solo IMEI del usuario y desde `deviceAccessFrom`.

### 3.2 Listado (`/listado`)

- Tabla en vivo, búsqueda, filtros de estado/origen/rango, nombres locales, export JSON, modal ~3 h.
- Entrada principal al detalle.
- Auto-refresh de flota (~10 min vía contexto).

### 3.3 Detalle de equipo (`/listado/detalle`)

- Telemetría del IMEI; historial con clamp de fecha de acceso.
- Control / Análisis solo con flags.
- Auditoría de vista de detalle (superadmin ve en Auditoría usuarios).

### 3.4 Administración (`/administracion`)

- **Grupos:** solo superadmin crea/edita IMEI del grupo.
- **Asignaciones:** admin/super asignan grupos e IMEI; campo **Acceso a datos desde**.
- Vaciar asignación es válido (flota vacía).

### 3.5 Usuarios (`/usuarios`)

- CRUD de cuentas; admin solo crea `user` bajo cuota.
- Flags Control y Análisis; flota en Administración.

### 3.6 Empresas (`/empresas`) — superadmin

- Maestro de empresas; vínculo a usuarios/grupos.

### 3.7 Correo y alertas (`/configuracion-correo`) — admin+

- Admin: máx. 2 grupos, 3 correos/grupo; equipos de su flota.
- Pestañas: Grupos | Registro de envíos | Alertas por equipo | (super: Remitente, Ciclos).
- Ciclo automático ~2 min; «Ejecutar ahora».
- Config personalizada por equipo ligada al **titular** (`ownerUsername`); no se hereda al reasignar IMEI.
- Registro de envíos e incidentes filtrados por equipos/correos y fecha de acceso.

### 3.8 Incidentes correo (`/incidentes-correo`)

- Episodios notificados; atender / comentar / archivar (archivar masivo: super).
- Visible según equipos en grupos de correo activos + fecha de acceso.

### 3.9 Alarmas (`/alarmas`)

- Eventos desde `numero_alarma` ↔ catálogo MP4000.
- Marcar atendida; alcance por flota y fecha.

### 3.10 Catálogo Alarmas (`/catalogo-alarmas`)

- Fichas técnicas; edición para gestores. Menú monitoreo no incluye esta ruta (Layout redirige).

### 3.11 Configuración Alarmas (`/configuracion-alarmas`) — superadmin

- Reglas locales de apoyo. Alertas productivas por email = módulo Correo.

### 3.12 Monitoreo (`/monitoreo`) — superadmin

- Gráficos históricos de apoyo (puede usar datos de demostración). Telemetría operativa = Listado.

### 3.13 Ubícanos (`/ubicanos`) — superadmin

- Mapa / ubicaciones; enlace desde detalle.

### 3.14 Control / Auditoría (`/control-auditoria`) — superadmin

- Log de comandos remotos (antes → después, ejecutor).

### 3.15 Auditoría usuarios (`/auditoria`) — superadmin

- Trail: login, vistas, descargas, cambios de configuración.

### 3.16 Análisis de señal (`/analisis-senal`) — superadmin

- Comportamiento wait/offline por mes; ubicaciones; exportación.

### 3.17 Ayuda/Soporte (`/ayuda`)

- Contacto, docs, videos, FAQ (editables por superadmin).
- **Manual por rol** (esta guía) precargado en UI: secciones Monitoreo / Admin / Superadmin.

### 3.18 Perfil (`/perfil`)

- Datos personales, avatar, contraseña, idioma, °C/°F, zona horaria.

---

## 4. Guías didácticas por rol (resumen web)

### Monitoreo

1. Entra → espera splash de Inicio.
2. Revisa KPIs y urgentes.
3. Listado → detalle → historial / alarmas.
4. Incidentes de correo si hay grupos.
5. Perfil / Ayuda sin depender de flota.

### Admin

1. Superadmin le asigna flota + (opcional) Control/Análisis.
2. Crea usuarios de monitoreo (sin IMEI en el formulario).
3. Administración: asigna y fija fechas de acceso.
4. Correo: grupos, umbrales, alertas por equipo, registro.
5. Opera Listado/Inicio como el resto.

### Superadmin

1. Empresas y grupos IMEI.
2. Asigna admins con flota y fechas.
3. Otorga permisos especiales.
4. SMTP, ciclos, auditorías, señal, ayuda editable.
5. Supervisa telemetría global vía Listado.

---

## 5. Ejemplos de negocio

**Reasignación de IMEI**  
El equipo `860719026077952` pasa de cliente A a RANSA. Se asigna a RANSA con «Acceso desde» = día de ingreso a patio. Historial anterior no se muestra a RANSA. La alerta «personalizada» de A no se aplica; RANSA configura de nuevo en Alertas por equipo.

**Búsqueda de historial fuera de ventana**  
Usuario con acceso desde 2026-08-18 busca julio 2026 → mensaje de sin acceso; si el rango cruza, se muestran datos desde 2026-08-18.

**Correo**  
Grupo con umbral 2 h → episodio fuera de rango → envío → incidente pendiente → operador marca atendida.

---

## 6. Archivos clave (desarrollo)

| Tema | Ubicación |
|------|-----------|
| Menú y guards | `src/app/Layout.tsx` |
| Rutas | `src/app/routes.tsx` |
| Permisos / fechas | `src/app/modules/usuario/*` |
| Manual web | `src/app/modules/ayuda/manualPorRol.ts` |
| Página ayuda | `src/app/pages/AyudaSoporte.tsx` |
| Splash Inicio | `src/app/components/InicioDataSplash.tsx` |
| Correo / alertas | `server/lib/alertEngine.js`, `deviceAlertConfigRepository.js` |

---

## 7. Mantenimiento

Al añadir un módulo o cambiar un permiso:

1. Actualizar esta `Ayuda_usuario.md`.
2. Reflejar secciones en `manualPorRol.ts`.
3. Verificar menú en `Layout.tsx` y textos i18n si aplica.
