
  # ZTRACK Temperature Monitoring Platform

  This is a code bundle for ZTRACK Temperature Monitoring Platform. The original project is available at https://www.figma.com/design/QZojqUF00nxdT1OPFEI8ek/ZTRACK-Temperature-Monitoring-Platform.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
Con Docker Compose (recomendado):
  docker compose up --build

  La app queda en http://localhost:3000.

  docker build -t ztemp .
docker run -p 3000:80 ztemp

Usuario	Contraseña
superadmin	superadmin2026
iifperu	iifperu2026

(Regla semilla: cuentas **@iff.com** → contraseña = **parte local en minúsculas + `2026`** sin dominio, ej. `keyla.lizarbe2026`. `superadmin` / `iifperu` → usuario en minúsculas + `2026`. Los usuarios IFF ven en el menú **Listado**, **Alarmas** y **Catálogo Alarmas** (solo equipos asignados por IMEI).)


Código	Status	Power	Container ID / IMEI	Nombre	Última Conexión	Set point	Return air	Temp. suministro	En rango	Alarmas	Ubicación
TUNEL	ONLINE	ON	

866262034780196	 va    IFF ZGRU6645466 MATERIA PRIMA #2

12/05/2026 15:53:44	-20	-20.8	-28.1	NORMAL	0	—
TUNEL	ONLINE	ON	

868428044595035	va IFF ZGRU7807130 PRODUCTO TERMINADO #1

12/05/2026 15:52:30	-4	2.6	-5.6	FUERA DE RANGO	0	—
TUNEL	ONLINE	ON	

863576046886862	va IFF ZGRU5014454 MATERIA PRIMA #1

12/05/2026 15:53:38	-20	-20.4	-27.6	NORMAL	0	—
TUNEL	ONLINE	ON	

863576043599872	 va IFF ZGRU7802800 PRODUCTO TERMINADO #2

12/05/2026 15:52:35	-4	16.6	11.2	FUERA DE RANGO	0	—
TUNEL	ONLINE	ON	

863576049740900	va IFF ZGRU5115406 MATERIA PRIMA #3

12/05/2026 15:54:50	-20	-20.3	-27.3	NORMAL	0	—
TUNEL	ONLINE	ON	

866262034327402	va IFF ZGRU5295105 MP BIXINAS

12/05/2026 15:55:50	-20	11.3	3.9	FUERA DE RANGO	0	—


866262034780196	 va IFF ZGRU6645466 MATERIA PRIMA #2
868428044595035	 va IFF ZGRU7807130 PRODUCTO TERMINADO #1
863576046886862	 va IFF ZGRU5014454 MATERIA PRIMA #1
863576043599872	 va IFF ZGRU7802800 PRODUCTO TERMINADO #2
863576049740900	 va IFF ZGRU5115406 MATERIA PRIMA #3
866262034327402	 va IFF ZGRU5295105 MP BIXINAS


866262034780196	 va  ZGRU6645466 
868428044595035	 va  ZGRU7807130 
863576046886862	 va  ZGRU5014454 
863576043599872	 va  ZGRU7802800  
863576049740900	 va  ZGRU5115406 
866262034327402	 va  ZGRU5295105 

### Usuarios IFF Perú (semilla en la app)

#### Login y alta automática de usuarios

Los usuarios de la tabla (más `superadmin` e `iifperu`) están definidos en código en [`src/app/modules/usuario/bootstrapUsers.ts`](src/app/modules/usuario/bootstrapUsers.ts). Al iniciar la aplicación se ejecuta `ensureUserRegistry()` ([`src/app/modules/usuario/userRepository.ts`](src/app/modules/usuario/userRepository.ts)): si `localStorage` está vacío se cargan todos los semillas; si ya hay datos, solo se **añaden** cuentas cuyo usuario aún no exista (no se sobrescriben contraseñas ya guardadas).

**Qué hacer para usar el login**

1. Arrancar la app (`npm run dev`, Docker Compose o imagen nginx como en la sección anterior).
2. Abrir la pantalla de login e ingresar **usuario** (correo `@iff.com` en minúsculas, o `superadmin` / `iifperu`) y **contraseña**.
3. Contraseña semilla para correos IFF: **solo la parte antes de `@iff.com`, en minúsculas, más `2026`** (ej.: usuario `keyla.lizarbe@iff.com` → contraseña `keyla.lizarbe2026`). Para `superadmin` e `iifperu`: **nombre de usuario + `2026`**. Las cuentas IFF (`iifperu` o `@iff.com`) entran al **Listado** y en el menú lateral ven **Listado**, **Alarmas** y **Catálogo Alarmas** (cada persona solo ve los IMEI que tiene en su perfil).
4. Si cambiaste usuarios en código y no ves las nuevas cuentas, contraseñas o IMEI asignados, borra en el navegador la clave `localStorage` `ztrack_users_registry_v1` o recarga la app (los IMEI de cuentas semilla se re-sincronizan al iniciar). También puedes usar una ventana privada.

#### Logo en la pantalla de login (`Logo ZTRACK.png`)

**Qué hacer**

1. Mantener una copia del PNG accesible para Vite como recurso estático: el proyecto usa **`public/logo-ztrack.png`** (nombre sin espacios para la URL).
2. Si actualizas el archivo fuente **`Logo ZTRACK.png`** en la raíz del repo, sincroniza la copia usada en build:

   ```bash
   cp "Logo ZTRACK.png" public/logo-ztrack.png
   ```

3. La pantalla de login ya muestra ese archivo desde [`src/app/pages/Login.tsx`](src/app/pages/Login.tsx) con la ruta `import.meta.env.BASE_URL + 'logo-ztrack.png'` (con `base: '/reefer/'` queda servido como `/reefer/logo-ztrack.png`).
4. Tras cambiar el PNG, vuelve a ejecutar `npm run build` o `docker compose build` para que la imagen nueva entre en `dist`/contenedor.

| Nombre | Usuario (login, minúsculas) | Contraseña inicial | Contenedores visibles |
|--------|-------------------------------|-------------------|----------------------|
| Keyla Lizarbe | keyla.lizarbe@iff.com | keyla.lizarbe2026 | ZGRU7807130, ZGRU7802800 |
| Miriam Espinoza | miriam.espinozahuaman@iff.com | miriam.espinozahuaman2026 | Los 6 IFF: ZGRU6645466, ZGRU7807130, ZGRU5014454, ZGRU7802800, ZGRU5115406, ZGRU5295105 |
| Luis Agapito | luis.agapito@iff.com | luis.agapito2026 | ZGRU7807130, ZGRU7802800, ZGRU5014454, ZGRU6645466, ZGRU5115406 |
| Luiggi Silvestre | luiggi.silvestre@iff.com | luiggi.silvestre2026 | ZGRU5295105 |
| Miguel Parra | miguel.parra@iff.com | miguel.parra2026 | ZGRU5295105 |
| Araceli Quispe | araceli.quispe@iff.com | araceli.quispe2026 | ZGRU5295105 |

#### Lista para enviar al cliente (credenciales IFF)

Texto listo para copiar y pegar (la aplicación solo muestra **Listado** a estos usuarios):

```
ZTRACK — Acceso IFF Perú

Al iniciar sesión verán el menú «Listado», «Alarmas» y «Catálogo Alarmas» (solo equipos asignados a su cuenta).

Keyla Lizarbe
  Usuario: keyla.lizarbe@iff.com
  Contraseña: keyla.lizarbe2026

Miriam Espinoza
  Usuario: miriam.espinozahuaman@iff.com
  Contraseña: miriam.espinozahuaman2026

Luis Agapito
  Usuario: luis.agapito@iff.com
  Contraseña: luis.agapito2026

Luiggi Silvestre
  Usuario: luiggi.silvestre@iff.com
  Contraseña: luiggi.silvestre2026

Miguel Parra
  Usuario: miguel.parra@iff.com
  Contraseña: miguel.parra2026

Araceli Quispe
  Usuario: araceli.quispe@iff.com
  Contraseña: araceli.quispe2026

(Regla: contraseña = parte del correo antes de @iff.com, todo en minúsculas, más el año 2026.)
```

Referencia IMEI ↔ ZGRU: ZGRU6645466 `866262034780196`, ZGRU7807130 `868428044595035`, ZGRU5014454 `863576046886862`, ZGRU7802800 `863576043599872`, ZGRU5115406 `863576049740900`, ZGRU5295105 `866262034327402`.

### Origen de datos: Listado, tabla y gráfica

La app es una SPA (Vite + React). Los datos **en vivo** y el **historial** vienen de APIs de telemetría reexpedidas por nginx (Docker) o por el proxy de Vite (desarrollo), bajo el prefijo `/reefer/telemetria/…`. Las bases se configuran en [`src/app/api/telemetryBases.ts`](src/app/api/telemetryBases.ts).

#### 1. Listado (pantalla principal IFF)

| Qué muestra | De dónde sale |
|-------------|----------------|
| Filas de equipos (status, power, set point, retorno, suministro, en rango, alarmas) | API **último estado** agregada en [`src/app/api/termoking.ts`](src/app/api/termoking.ts) → `fetchUltimoEstadoDispositivos()` |
| Endpoints (GET) | `{base}/Tunel/ultimo_estado_dispositivos/`, `{base}/TermoKing/ultimo_estado_dispositivos/`, `{base_starcool}/Starcool/ultimo_estado_dispositivos/` |
| Qué equipos ve cada usuario | Campo `deviceAccess` del usuario (lista de IMEI o `all`). Filtro en [`src/app/modules/usuario/userPermissions.ts`](src/app/modules/usuario/userPermissions.ts) → `userMayAccessImei()` |
| Nombre en columna «Nombre» | `deviceNames` del perfil (semilla en [`bootstrapUsers.ts`](src/app/modules/usuario/bootstrapUsers.ts)) o nombre local editado en el listado (`localStorage` `ztrack_device_local_names_v1`) |
| Alarmas en columna | Campo `ultimo_dato.numero_alarma` de la API, enlazado al catálogo MP4000 en [`src/app/modules/alarma/`](src/app/modules/alarma/) |
| Resumen superior (online / wait / offline) | `data.resumen` de la misma respuesta; si el usuario no es global, se recalcula solo con sus IMEI visibles |

Flujo: al abrir **Listado** → `fetchUltimoEstadoDispositivos()` → se fusionan las tres fuentes → cada fila es un `DispositivoUltimoEstado` con `ultimo_dato` (temperaturas, alarmas, GPS, etc.). Clic en una fila abre **Detalle del equipo** (`/listado/detalle?imei=…&codigo=TUNEL`).

#### 2. Tabla de historial (detalle del equipo)

| Qué muestra | De dónde sale |
|-------------|----------------|
| Tabla paginada (fecha, set point, suministro, retorno, evaporador, sensores cargo, etc.) | API **buscar datos oficiales** en [`src/app/api/datosOficiales.ts`](src/app/api/datosOficiales.ts) → `fetchBuscarDatosOficiales(codigo, imei, { fechaInicial, fechaFinal })` |
| Endpoints (GET) | `{base}/Tunel/buscar_datos_oficiales/{imei}?fecha_inicial=…&fecha_final=…` (y equivalentes TermoKing / Starcool según `codigo` del equipo) |
| UI | Componente [`HistorialOficialDetalle.tsx`](src/app/components/HistorialOficialDetalle.tsx), pestaña **Tabla**; columnas definidas en [`src/app/lib/historialOficial.ts`](src/app/lib/historialOficial.ts) |
| Rango de fechas | Selector «Desde / Hasta» en la pantalla (por defecto últimas 12 h); formato de query `YYYY-MM-DD_HH-mm-ss` |

Flujo: en detalle del equipo, si el origen es TUNEL, TERMOKING o STARCOOL → se muestra el bloque de historial → al pulsar **Buscar** se llama a la API → `data.datos[]` alimenta la tabla (orden más reciente primero).

#### 3. Gráfica (detalle del equipo)

| Qué muestra | De dónde sale |
|-------------|----------------|
| Líneas set temperatura, suministro, retorno, evaporador vs tiempo | **Los mismos** registros de `buscar_datos_oficiales` que la tabla |
| Transformación | [`datosAGrafica()`](src/app/lib/historialOficial.ts) convierte cada fila del historial en un punto del gráfico (Recharts) |
| UI | Misma pantalla [`HistorialOficialDetalle.tsx`](src/app/components/HistorialOficialDetalle.tsx), pestaña **Gráfica** |

No hay un endpoint aparte para la gráfica: tabla y gráfica comparten una sola consulta al historial oficial; cambiar el rango de fechas y buscar actualiza ambas.

#### Nota sobre «Monitoreo»

La pantalla **Monitoreo** del menú (usuarios no IFF) usa datos **mock** locales ([`src/app/mockData.ts`](src/app/mockData.ts)), no las APIs anteriores. El historial **real** con tabla y gráfica está en **Listado → clic en equipo → Historial oficial**.





para el caso de los equipo de IFF , se activa una zona de control de temperatura , stop plan , defrost  que se activa segun su imei en el siguinete link


http://161.132.53.51:9051/Tunel/comando_control_tunel/IMEI?tipo=1&dato=1


Para cambio de temperatura el tipo es de 1 
y funciona de -30 a 15 grados en dato
ejemplo pra imei 866262034780196 cambiar a -6
http://161.132.53.51:9051/Tunel/comando_control_tunel/866262034780196?tipo=1&dato=-6




Para hacer defost el tipo es 8 y el dato es 1 por defecto
no hay rango solo boton de aplicar 
ejemplo para imei 863576049740900 hacer defrost 
http://161.132.53.51:9051/Tunel/comando_control_tunel/863576049740900?tipo=8&dato=1


para hacer stop plan el tipo es 10 y el dato es 3600 segundos 
el rango es de 5 a 60 minutos 
ejemplo para imei 866262034327402 hacer stop plan de 5 minutos 
http://161.132.53.51:9051/Tunel/comando_control_tunel/866262034327402?tipo=10&dato=300

#### 4. Control remoto IFF (UI + auditoría)

En la app, los equipos IFF con código `TUNEL` (6 IMEI configurados) muestran un panel de control en el detalle del equipo ([`IffControlPanel.tsx`](src/app/components/IffControlPanel.tsx)). Los comandos **no** se envían directamente desde el navegador al host anterior: pasan por el proxy `/reefer/telemetria/tunel-termoking/` y el módulo [`src/app/modules/control/`](src/app/modules/control/).

| Qué | Dónde |
|-----|--------|
| Envío del comando | [`commandService.ts`](src/app/modules/control/commandService.ts) → `ejecutarComandoTunel()` |
| API HTTP | [`comandoControlTunel.ts`](src/app/api/comandoControlTunel.ts) |
| Auditoría (quién ejecutó) | [`commandLogRepository.ts`](src/app/modules/control/commandLogRepository.ts) → `localStorage` clave `ztrack_control_commands_v1` |
| Historial en pantalla | [`ControlCommandLogPanel.tsx`](src/app/components/ControlCommandLogPanel.tsx) (por IMEI en detalle) |
| Página auditoría (menú IFF) | [`ControlAuditoria.tsx`](src/app/pages/ControlAuditoria.tsx) → ruta `/control-auditoria` |
| Datos reefer en detalle IFF | [`EquipoEstatusCards.tsx`](src/app/components/EquipoEstatusCards.tsx) + [`EquipoReeferDetallePanel.tsx`](src/app/components/EquipoReeferDetallePanel.tsx) — solo telemetría de refrigeración (sin etileno/CO₂; no es madurador) |

Cada comando registrado guarda: `userId`, `username`, IMEI, tipo, dato, etiqueta legible, fecha, éxito/error, resumen de respuesta, **`estadoAnterior`** (snapshot reefer antes del cambio) y **`cambios`** (valor anterior → nuevo). Al enviar un comando se muestra el modal **Confirmar Cambios** ([`ConfirmarComandoModal.tsx`](src/app/components/ConfirmarComandoModal.tsx)). Los usuarios `@iff.com` ven **Control / Auditoría** en el menú lateral con el historial de sus equipos.

#### 5. Alarmas por slot (`alarma_01`, `alarma_02`, …)

Además de `numero_alarma`, la telemetría puede traer campos `alarma_01` … `alarma_12` (y otros `alarma_N` dinámicos). El módulo [`alarmSlots.ts`](src/app/modules/alarma/alarmSlots.ts):

- Lee todos los slots conocidos y claves `alarma_*` del `ultimo_dato`.
- Valida que el valor sea numérico y **> 0** (0, vacío o no numérico = sin alarma en ese slot).
- Relaciona cada código con el catálogo MP4000 ([`alarmCatalogRepository.ts`](src/app/modules/alarma/alarmCatalogRepository.ts)) para mostrar el significado.

| Dónde se usa | Comportamiento |
|--------------|----------------|
| Detalle equipo (IFF y resto) | [`DeviceAlarmasPanel.tsx`](src/app/components/DeviceAlarmasPanel.tsx): tabla campo / código / significado / «En catálogo» |
| Listado y Alarmas | Badges con texto del catálogo vía `extractActiveAlarmCodes()` |
| Sincronización de eventos | [`syncDeviceAlarms.ts`](src/app/modules/alarma/syncDeviceAlarms.ts) considera todos los slots activos |

Si un código no está en el catálogo, se muestra igual con la etiqueta «Sin ficha»; el superadmin puede completar el catálogo en **Catálogo Alarmas**.

