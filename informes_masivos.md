# Informes masivos: campaña, Drive y correo

Módulo aparte del **Generador de informes** (un equipo, a mano). Una campaña agrupa varios dispositivos de un cliente, genera el PDF de cada uno, los reúne en una carpeta de Google Drive y, al terminar, avisa por correo con el enlace de esa carpeta.

Zona horaria de programación, nombres de archivo y fechas del PDF: **America/Lima (GMT-5)**.

## Qué ya existe y se reutiliza

- Motor PDF en `server/informe/engine/` (`run_serie.py`). Un equipo, un rango de fechas, telemetría oficial (`buscar_datos_oficiales`). El teléfono de 9 dígitos que empieza por 9 no entra al título ni al nombre del archivo. La cabecera lleva el nombre del equipo, sin el prefijo «Equipo:».
- Arranque de un informe: `server/lib/informe/generador.js` (`startInformeJob`). El trabajo vive en memoria y los archivos en `/app/server/data/informes/<jobId>/` (volumen Docker `correo-data`).
- API actual: `/reefer/api/informes/` (nginx, lectura 120 s). Pantalla: ruta `/informes`.
- Correo: SMTP Gmail en Configuración de correo (`server/data/smtp.json`, `getSmtpConfig` + nodemailer).
- Grupos de correo ya tienen listas de destinatarios. La campaña puede copiar esos correos o guardar los suyos.
- Programador de referencia: `server/lib/reporteProgramado.js` (tick cada 60 s, hora Lima, `lastSentSlot`). Ese módulo manda un resumen de texto, no PDFs.

## Qué hay que construir

1. Credencial de Drive (una de las dos vías de abajo) y SMTP con clave de aplicación.
2. Cola persistente. El lote no puede depender del `Map` en memoria de `generador.js`: un reinicio del contenedor lo borra, y nginx corta a los 120 s. La campaña responde enseguida y un worker sigue equipo por equipo.
3. Pantalla nueva, separada del generador de un equipo.
4. Al cierre del lote: carpeta Drive `Cliente / AAAA-MM` con los PDF y un solo correo al grupo con el enlace. Si algún equipo falla, el correo lista el fallo y el enlace apunta a lo que sí se subió.

Secreto de Drive y de SMTP viven solo en el volumen `/app/server/data`. No van al repositorio.

---

## Paso 1. SMTP (las dos vías de Drive lo necesitan)

Sin esto el PDF puede generarse y subirse, y el aviso no sale.

1. En la cuenta Gmail que enviará (Workspace o personal): activar verificación en 2 pasos.
2. [Contraseñas de aplicaciones](https://myaccount.google.com/apppasswords) → Correo → otra (Windows) → generar. Son 16 caracteres. No es la clave de ingreso.
3. En la app, como superadmin: **Configuración de correo** → SMTP.
   - Usuario: ese Gmail.
   - Clave de aplicación: la de 16 caracteres.
   - Nombre del remitente: `ZTRACK TELEMETRY` (o el que se quiera ver).
4. Guardar. Queda en el volumen como `smtp.json`.
5. En la misma pestaña, **Correo de prueba**: escribir un destino y pulsar **Enviar prueba**. Guarda el remitente y manda un aviso corto, sin necesidad de un grupo de equipos. Tiene que llegar el mensaje «ZTRACK — prueba de remitente». Si la respuesta es «SMTP no configurado», este paso no quedó guardado.

---

## Paso 2-A. Unidad compartida (Google Workspace) — vía recomendada

La cuenta de servicio no tiene cuota en «Mi unidad». Subir ahí falla con `storageQuotaExceeded`. En una **unidad compartida** la cuota es de la organización y la cuenta de servicio sí puede crear carpetas y subir PDF.

### A1. Proyecto y API

1. [Google Cloud Console](https://console.cloud.google.com/) con un usuario del Workspace.
2. Proyecto nuevo, por ejemplo `ztrack-informes`.
3. **APIs y servicios → Biblioteca** → buscar **Google Drive API** → Habilitar.

### A2. Cuenta de servicio

1. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
2. Nombre: `ztrack-informes`. Crear y continuar. Rol del proyecto: ninguno (Drive se autoriza compartiendo la unidad, no con un rol de IAM).
3. Entrar a la cuenta → **Claves → Agregar clave → JSON**. Se descarga un archivo. Dejarlo fuera del repositorio.
4. En la app, como superadmin: **Correo → Drive** → elegir ese JSON. El servidor lo valida (tiene que ser `type: service_account` y el correo debe terminar en `iam.gserviceaccount.com`) y lo guarda en el volumen, en `/app/server/data/drive-service-account.json`, al lado de `smtp.json`. La clave privada no vuelve al navegador ni se guarda en `localStorage`. No hace falta `docker cp` ni reconstruir la imagen.
5. La pantalla muestra el `client_email`. Ese correo se invita a la unidad compartida.

### A3. Unidad compartida y permiso

1. En Drive del Workspace: **Unidades compartidas → Nueva** → `ZTRACK Informes`.
2. **Administrar miembros** → pegar el `client_email` → rol **Administrador de contenido** (puede crear carpetas y subir; no hace falta administrador de la unidad).
3. Abrir la unidad. El id está en la URL:

   `https://drive.google.com/drive/folders/<ID>`

   Ese enlace se pega en **Correo → Drive → Carpeta general**. Es la raíz de todas las campañas.

### Orden de carpetas de una campaña

La carpeta general no se reparte por cliente. Al correr una campaña el sistema crea, si no existen:

`CARPETA_GENERAL / CLIENTE / MES_AÑO / SEMANA_n`

- El cliente se guarda en mayúsculas (`DONOFRIO`).
- El mes usa nombre en español y el año: `SETIEMBRE_2026`, `OCTUBRE_2026`.
- La semana es de lunes a domingo y el número es del mes. El día 1 siempre cae en `SEMANA_1`, aunque el lunes haya sido del mes anterior. Un mes queda con 3 o 4 semanas completas y las semanas de los bordes.
- Si el rango pedido cruza de mes, se parte. Del lunes 28 de setiembre al domingo 4 de octubre de 2026 salen dos cortes:
  - `DONOFRIO/SETIEMBRE_2026/SEMANA_5` con los informes del 28 al 30.
  - `DONOFRIO/OCTUBRE_2026/SEMANA_1` con los informes del 1 al 4.
- La semana siguiente, del 5 al 11 de octubre, queda en `DONOFRIO/OCTUBRE_2026/SEMANA_2`. Cada dispositivo de la campaña genera su PDF solo con los días de ese corte.

En Correo → Drive, con cliente y fechas, **Ver orden** muestra esas rutas sin tocar Drive. **Crear carpetas** revisa cada nivel: si `CLIENTE`, `MES_AÑO` o `SEMANA_n` ya existe, la reutiliza y no crea otra con el mismo nombre.

### A4. Comprobación antes de programar

Script de una sola vez, dentro del contenedor (`googleapis` todavía no está en la imagen; instalarlo solo para la prueba, o esperar al paso de desarrollo que lo agrega al `package.json` del server):

```bash
cd /app/server && npm install googleapis
node --input-type=module -e "
import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({
  keyFile: '/app/server/data/drive-service-account.json',
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });
const folderId = 'PEGAR_ID_DE_LA_UNIDAD';
const created = await drive.files.create({
  requestBody: { name: 'prueba-ztrack', mimeType: 'application/vnd.google-apps.folder', parents: [folderId] },
  supportsAllDrives: true,
  fields: 'id, webViewLink',
});
console.log(created.data);
"
```

Tiene que imprimir `id` y `webViewLink`, y la carpeta `prueba-ztrack` verse en la unidad. Borrarla después.

`supportsAllDrives: true` va en **cada** llamada (`files.create`, `files.list`, `permissions.create`). Sin eso Drive responde «file not found» aunque el id sea correcto.

Variables que usará el módulo:

| Dato | Dónde |
| --- | --- |
| `DRIVE_MODO=service_account` | entorno del servicio `app` en `docker-compose.yml` |
| JSON | `/app/server/data/drive-service-account.json` |
| Enlace de la carpeta general | Correo → Drive. Una sola raíz para todas las campañas |

---

## Paso 2-B. Cuenta personal de Gmail

Sirve si no hay Workspace. Una cuenta de servicio **no** puede dejar archivos en el «Mi unidad» de un Gmail personal (no tiene cuota). El acceso es OAuth de una persona real: los PDF quedan en el Drive de esa cuenta.

Limitación: si la pantalla de consentimiento queda en **Pruebas**, Google anula el refresh token a los **7 días** y hay que volver a autorizar. Para que no caduque, la app OAuth tiene que estar en **Producción**. El alcance `drive.file` no es sensible y no pide verificación de Google. Con ese alcance la app solo ve lo que ella misma crea: ella crea la carpeta raíz y, dentro, la del mes.

### B1. Cliente OAuth

1. Mismo proyecto de Cloud Console (o uno nuevo) y **Google Drive API** habilitada.
2. **Pantalla de consentimiento de OAuth** → Externo → nombre `ZTRACK Informes`, correo de asistencia el Gmail personal.
3. Alcance: `https://www.googleapis.com/auth/drive.file`.
4. **Usuarios de prueba**: ese Gmail (obligatorio mientras esté en Pruebas).
5. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación de escritorio**. Descargar el JSON. No commitearlo.
6. Publicar la app (**En producción**) cuando el token de prueba funcione, para que el refresh no muera a los 7 días. Con solo `drive.file` no hace falta la verificación de marca.

### B2. Refresh token (una sola vez, en el host)

```bash
npm install googleapis
node --input-type=module -e "
import { google } from 'googleapis';
import http from 'node:http';
const client = JSON.parse(await import('node:fs').then(fs => fs.readFileSync('client_secret.json','utf8'))).installed;
const oauth = new google.auth.OAuth2(client.client_id, client.client_secret, 'http://127.0.0.1:53682');
const url = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});
console.log(url);
http.createServer(async (req, res) => {
  const code = new URL(req.url, 'http://127.0.0.1:53682').searchParams.get('code');
  res.end('listo, puede cerrar');
  const { tokens } = await oauth.getToken(code);
  console.log(JSON.stringify({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: tokens.refresh_token,
  }, null, 2));
  process.exit(0);
}).listen(53682);
"
```

Abrir la URL, entrar con el Gmail, aceptar. El JSON impreso se guarda en el volumen como `/app/server/data/drive-oauth.json`.

### B3. Comprobación

Misma idea que A4, con `GoogleAuth` sustituido por:

```js
const oauth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret);
oauth.setCredentials({ refresh_token: cfg.refresh_token });
const drive = google.drive({ version: 'v3', auth: oauth });
```

`parents` puede omitirse en la primera carpeta: Drive la crea en la raíz de esa cuenta. Guardar su `id` como raíz de las campañas. Compartirla con quien deba verla (paso de desarrollo: `permissions.create` con `role: 'reader'` y `type: 'user'`, o `type: 'anyone'` + `role: 'reader'` si el enlace debe abrir sin login). `drive.file` permite compartir archivos creados por la propia app.

Variables:

| Dato | Dónde |
| --- | --- |
| `DRIVE_MODO=oauth` | entorno del servicio `app` |
| client id, secret, refresh token | `/app/server/data/drive-oauth.json` |

Elegir **una** vía. `DRIVE_MODO` dice cuál lee el servidor. No hace falta implementar las dos a la vez el primer día: dejar el lector de credencial con las dos ramas y probar la que se haya configurado.

---

## Paso 3. Ignorar secretos

Agregar a `.gitignore` (el volumen ya está fuera de la imagen, pero el archivo puede quedar en el árbol local):

```
server/data/drive-service-account.json
server/data/drive-oauth.json
server/data/smtp.json
client_secret.json
```

`.dockerignore` ya excluye `.env` y `*.md`. El JSON de la cuenta de servicio no debe entrar en `COPY server` de la imagen: o se copia al volumen después del build (como en A2) o se monta solo en runtime. Preferible el volumen, porque sobrevive a `docker compose up --build`.

---

## Paso 4. Modelo de la campaña

Archivo en el volumen, igual que los reportes de comportamiento: `server/data/campanasInformes.json`. Escritura después de **cada equipo**, para reanudar si el contenedor se reinicia.

Campaña:

| Campo | Uso |
| --- | --- |
| `id` | `camp-…` |
| `cliente` | Nombre que va a la carpeta y al asunto del correo |
| `equipos` | `{ imei, codigo, nombre }[]`. El nombre sale de telemetría; si es «SIN ASIGNAR», la campaña exige un nombre escrito |
| `periodo` | `mes_anterior` (del día 1 al último del mes previo, Lima) o `rango` con `desde` / `hasta` fijos |
| `dia`, `hora`, `minuto` | Cuándo corre. `dia` 1–28 para que todos los meses existan |
| `emails` | Lista del aviso. Se puede partir de un grupo de correo y editarla |
| `cliente`, `desde`, `hasta` | El cliente arma `CLIENTE/MES_AÑO/SEMANA_n` bajo la carpeta general |
| `tolerancia`, `idioma`, `reconstruir` | Los mismos criterios del generador individual (tolerancia ±9, `es`, reconstruir sí) |
| `activo` | Si el reloj la dispara |
| `ultimoPeriodo` | `AAAA-MM` ya enviado, para no repetir el mes |
| `owner` | Usuario que la creó. Un admin solo mete equipos de su flota (`filterDispositivosForUser`) |

Corrida (historial dentro de la campaña o en `campanasInformesRuns.json`):

| Campo | Uso |
| --- | --- |
| `id`, `campanaId` | |
| `desde`, `hasta` | Rango concreto de esa corrida |
| `estado` | `pendiente` → `generando` → `subiendo` → `enviado` o `error` |
| `equipos` | Por cada uno: `pendiente` / `pdf_listo` / `subido` / `error` + mensaje + `archivo` + `driveFileId` |
| `carpetaId`, `carpetaUrl` | Carpeta del mes |
| `mailMessageId`, `mailError` | Resultado del aviso |

---

## Paso 5. Orden de desarrollo

Cada paso se puede probar solo. No mezclar la pantalla con Drive el primer día.

### 5.1 Cliente de Drive — `server/lib/informe/drive.js`

- Leer `DRIVE_MODO` y el JSON del volumen.
- `crearCarpeta(parentId, nombre)` → `{ id, webViewLink }`. Nombre del mes: `{cliente} / {AAAA-MM}`. Si el nombre trae `/`, usar un solo nivel `{cliente} {AAAA-MM}` para no anidar de más, o crear dos niveles a propósito (cliente y, dentro, el mes). Lo útil es **dos niveles**: carpeta del cliente (fija en la campaña, o creada la primera vez y guardada) y dentro una carpeta por mes.
- `subirPdf(parentId, rutaLocal, nombreArchivo)` con `mimeType: 'application/pdf'`.
- `enlaceCarpeta(id)`.
- En modo cuenta de servicio, todas las llamadas con `supportsAllDrives: true`.
- Dependencia: `googleapis` en el `package.json` de `server/` (el `npm install --omit=dev` de la imagen lo instala).
- Prueba: el script de A4 o B3, ya contra este módulo, subiendo un PDF mínimo y borrando la carpeta de prueba.

### 5.2 Generar un PDF sin dejar el job solo en memoria — reutilizar `generador.js`

`startInformeJob` ya escribe `serie.csv`, llama a Python y deja `Informe_*.pdf`. La cola debe:

1. Crear la corrida en disco con todos los equipos en `pendiente`.
2. Tomar el siguiente `pendiente`, armar el mismo cuerpo que `POST /reefer/api/informes/generar` (imei, codigo, desde, hasta, nombre, tolerancia) y **esperar** a que el proceso Python termine.
3. Copiar solo el PDF en español (`Informe_*.pdf`) a la carpeta de la corrida. CSV y el PDF en inglés no se suben.
4. Marcar `pdf_listo` y seguir. Un equipo con «No hay telemetría oficial…» queda en `error` y no detiene al resto.
5. Un equipo a la vez. Cada uno puede tardar minutos (historial oficial, mes a mes, tope 15 min en `generador.js`).

Extraer de `generador.js` una función `generarInformeSync(input)` que devuelva la ruta del PDF, y dejar `startInformeJob` como envoltura para la pantalla de un solo equipo. Así las dos pantallas comparten el motor.

### 5.3 API

Bajo el router que ya monta `emailServer.mjs` en `/reefer/api/informes`, o un router hermano `/reefer/api/informes-masivos`:

| Método | Ruta | Hace |
| --- | --- | --- |
| `GET` | `/campanas` | Lista del usuario (superadmin ve todas) |
| `POST` | `/campanas` | Crea. Valida equipos contra la flota del actor |
| `PUT` | `/campanas/:id` | Edita. No deja meter un IMEI fuera de la flota |
| `DELETE` | `/campanas/:id` | Borra la programación. No borra carpetas de Drive ya creadas |
| `POST` | `/campanas/:id/lanzar` | Encola una corrida ya. Responde `{ runId }` al momento. No genera los PDF en esta petición |
| `GET` | `/campanas/:id/corridas` | Estado para que la pantalla haga polling |

Sesión igual que el resto: cabecera `X-ZTrack-User`. El botón «lanzar» no debe contar como el envío programado del mes (`ultimoPeriodo` solo lo escribe el reloj, o también el lanzamiento manual si se decide que el manual cubre el mes: dejarlo **solo en el reloj**, igual que `sendScheduleNow` de los reportes de comportamiento).

### 5.4 Worker

En `emailServer.mjs`, al lado del tick de reportes programados, cada 60 s:

1. Si ya hay una corrida en `generando` o `subiendo`, seguir esa y no abrir otra.
2. Si no, mirar campañas `activo` cuyo `dia`/`hora`/`minuto` (gracia 10 min, como el otro programador) coincidan y cuyo `ultimoPeriodo` no sea el mes en curso.
3. Calcular `desde`/`hasta` del mes anterior si `periodo` es `mes_anterior`.
4. Al terminar todos los equipos: crear la carpeta del mes, subir los PDF en estado `pdf_listo`, pasar a `subiendo`.
5. Correo único, con `getSmtpConfig()`:

   - Asunto: `Informe de cadena de frío listo — {cliente} — {mes}`.
   - Cuerpo: el reporte del cliente ya está generado y se puede ver en la carpeta, más el `webViewLink`. Si hubo errores, una línea por equipo con el motivo.
   - `to`: los `emails` de la campaña.

6. Guardar `ultimoPeriodo`, `mailMessageId` y estado `enviado`. Si SMTP falla, estado `error` en el correo y **no** marcar el periodo como enviado, para que el siguiente tick reintente solo el correo (los PDF ya están en Drive: no regenerar).

### 5.5 Pantalla — aparte del generador

- Ruta `/informes-masivos`, ítem de menú propio («Campañas de informes»), misma regla de flota que `/informes`.
- Lista de campañas: cliente, cantidad de equipos, día y hora, último estado, enlace de la última carpeta.
- Formulario: nombre del cliente, buscador de equipos (el mismo criterio que `GeneradorInformes.tsx`: texto, no un `<select>`, tope de resultados, nombre de telemetría bloqueado salvo «SIN ASIGNAR»), periodo, día, hora, minuto, correos, id de carpeta Drive, tolerancia.
- «Generar ahora» llama a `lanzar` y muestra el avance por equipo (polling de la corrida).
- No hace falta subir el timeout de nginx: la petición de lanzar es corta.

### 5.6 Imagen

`googleapis` queda en `server/package.json`. Reconstruir con `docker compose up --build`. El JSON de Drive se vuelve a copiar al volumen si el build no lo trae (no debe traerlo).

---

## Paso 6. Criterio de “listo”

1. SMTP de prueba llega.
2. La comprobación de Drive crea una carpeta visible con el enlace.
3. Una campaña de dos equipos, «Generar ahora», deja dos PDF en `Cliente / AAAA-MM` y un solo correo con ese enlace.
4. Un equipo sin datos en el rango queda en error dentro del mismo correo; el otro PDF sí está en la carpeta.
5. Reiniciar el contenedor a mitad de lote y volver a levantar: la corrida sigue en el equipo que faltaba, sin repetir el que ya estaba `subido`.
6. Con la campaña activa, al llegar el día y la hora no se dispara otra vez el mismo `AAAA-MM`.
7. Un admin sin ese IMEI en su flota recibe 403 al guardarlo.
8. El generador de un solo equipo (`/informes`) sigue generando y descargando como antes.

## Fuera de este módulo

- No reemplaza los correos de incidente (fuera de rango, fuera de línea, apagado) ni el reporte de comportamiento cada 6/8/12/24 h.
- No cachea el historial oficial. Si esa API está caída, el equipo de la campaña falla y el correo lo dice.
- El enlace de Drive abre a quien tenga permiso en la carpeta. En Workspace el permiso sale de la unidad compartida. En Gmail personal hay que compartir la carpeta (cuentas concretas o «cualquiera con el enlace»).
