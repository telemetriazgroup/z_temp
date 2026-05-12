
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

(Regla semilla: **usuario en minúsculas + `2026`**, mismo criterio para correos IFF.)


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
2. Abrir la pantalla de login e ingresar **usuario** (correo o `superadmin` / `iifperu`) y **contraseña**.
3. Regla de contraseña semilla: **mismo usuario en minúsculas + `2026`** (ej.: `keyla.lizarbe@iff.com` → `keyla.lizarbe@iff.com2026`). Conviene cambiarla después en **Administración → Usuarios** (como `superadmin`).
4. Si cambiaste usuarios en código y no ves las nuevas cuentas o contraseñas, borra en el navegador la clave `localStorage` `ztrack_users_registry_v1` o usa una ventana privada para volver a aplicar los semillas.

#### Logo en la pantalla de login (`Logo ZTRACK.png`)

**Qué hacer**

1. Mantener una copia del PNG accesible para Vite como recurso estático: el proyecto usa **`public/logo-ztrack.png`** (nombre sin espacios para la URL).
2. Si actualizas el archivo fuente **`Logo ZTRACK.png`** en la raíz del repo, sincroniza la copia usada en build:

   ```bash
   cp "Logo ZTRACK.png" public/logo-ztrack.png
   ```

3. La pantalla de login ya muestra ese archivo desde [`src/app/pages/Login.tsx`](src/app/pages/Login.tsx) con la ruta `import.meta.env.BASE_URL + 'logo-ztrack.png'` (con `base: '/reefer/'` queda servido como `/reefer/logo-ztrack.png`).
4. Tras cambiar el PNG, vuelve a ejecutar `npm run build` o `docker compose build` para que la imagen nueva entre en `dist`/contenedor.

| Nombre | Usuario (correo) | Contraseña inicial | Contenedores visibles |
|--------|------------------|-------------------|----------------------|
| Keyla Lizarbe | keyla.lizarbe@iff.com | keyla.lizarbe@iff.com2026 | ZGRU7807130, ZGRU7802800 |
| Miriam Espinoza | Miriam.EspinozaHuaman@IFF.com | miriam.espinozahuaman@iff.com2026 | Igual que Keyla (ajustar en Administración si hace falta otro alcance). |
| Luis Agapito | luis.agapito@iff.com | luis.agapito@iff.com2026 | ZGRU7807130, ZGRU7802800, ZGRU5014454, ZGRU6645466, ZGRU5115406 |
| Luiggi Silvestre | luiggi.silvestre@iff.com | luiggi.silvestre@iff.com2026 | ZGRU5295105 |
| Miguel Parra | miguel.parra@iff.com | miguel.parra@iff.com2026 | ZGRU5295105 |
| Araceli Quispe | Araceli.Quispe@IFF.com | araceli.quispe@iff.com2026 | ZGRU5295105 |

Referencia IMEI ↔ ZGRU: ZGRU6645466 `866262034780196`, ZGRU7807130 `868428044595035`, ZGRU5014454 `863576046886862`, ZGRU7802800 `863576043599872`, ZGRU5115406 `863576049740900`, ZGRU5295105 `866262034327402`.





