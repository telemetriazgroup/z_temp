# Implicancias ZTRACK — observaciones operativas

## Postgres: «Database directory appears to contain a database; Skipping initialization»

**Qué significa:** normal. El volumen Docker `postgres-analisis` ya tiene un cluster inicializado de un arranque anterior. La imagen oficial de Postgres solo ejecuta `initdb` + scripts de `docker-entrypoint-initdb.d` la **primera** vez que el directorio de datos está vacío.

**Implicancia:** reiniciar `docker compose` **no** recrea la base ni borra tablas. Los datos de análisis/dashboard se conservan. Para empezar de cero hay que borrar el volumen (`docker compose down -v`), no solo reiniciar el contenedor.

---

## Error: `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` en `dashboard_fleet_snapshot`

**Qué pasó:** en el boot de `emailServer.mjs` se llamaba en **paralelo**:

1. `ensureAnalisisSchema()` → al final también ejecuta `ensureDashboardSchema()` / `002_dashboard.sql`
2. `ensureDashboardSchema()` otra vez como promesa aparte

Dos conexiones PostgreSQL intentaban `CREATE TABLE IF NOT EXISTS dashboard_fleet_snapshot` a la vez. En Postgres ese `IF NOT EXISTS` **no es atómico entre sesiones**: ambas ven que la tabla “aún no existe”, ambas intentan crear el tipo interno `dashboard_fleet_snapshot`, y una pierde con `pg_type_typname_nsp_index`.

En el log se ve el patrón típico:

1. `[dashboard] esquema PostgreSQL listo` (ganó la primera)
2. `ERROR: duplicate key ... (dashboard_fleet_snapshot, 2200) already exists` (perdió la segunda)
3. `[analisis] no se pudo migrar esquema` (porque esperaba la misma migración)

**Implicancia:** las tablas suelen **quedar creadas** por la sesión que ganó; el fallo es de la segunda corrida, no de un volumen corrupto. Aun así, el arranque de snapshots / análisis podía quedar en “esquema diferido” y no registrar históricos hasta el siguiente reinicio limpio.

**Mitigación aplicada:**

- Un solo camino de migración en boot: `ensureAnalisisSchema()` (incluye dashboard).
- Candado in-process (`analisisMigrating` / `dashboardMigrating`) para no relanzar el mismo SQL en paralelo.
- Si aún aparece la carrera (p. ej. dos procesos), se trata `already exists` / `pg_type_typname_nsp_index` como éxito idempotente.

---

## Links API: último estatus + trazabilidad 3 h

Cada consulta de `ultimo_estado_dispositivos` (ciclo de alertas, snapshot dashboard, overview) registra:

- `dashboard_link_probe`: sonda por origen (TUNEL / STARCOOL / STARCOOL2 / TERMOKING), retención **3 horas**
- `dashboard_link_status`: último OK/DOWN + `last_success` (conteos y muestra) para mostrar el último estatus si el link cae

El dashboard avisa al **superusuario** si algún link está DOWN, sin perder la última foto buena.

## Equipos nuevos

`dashboard_known_device` guarda `first_seen_at` (primera conexión observada). El primer llenado de la tabla es bootstrap (`revisado`); apariciones posteriores van a cola `pendiente` para revisión rápida en Inicio.

## Usuarios conectados

Cada login exitoso escribe en `dashboard_user_login` (últimos 30 días). Visible solo a superusuario en el dashboard.
