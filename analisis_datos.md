# Análisis mensual de eventos por dispositivo

Documento de proceso para una interfaz de **análisis de telemetría / eventos** (apagado, fuera de rango, sin transmisión) por equipo (`imei` + `codigo`), con persistencia en **base de datos real**, clasificación operativa y reanálisis incremental.

Estado: **implementación iniciada** (API + motor + UI en detalle). Pendientes menores en §10. Ver §12.

---

## 0. Decisiones cerradas (respuestas de producto)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Quién usa | Usuarios de **monitoreo** y **admin** (superusuario / administración). |
| 1 | Dónde | En el **detalle de telemetría** del equipo: sección/pestaña **«Análisis de telemetría»** con trazabilidad del mes. |
| 1 | Meses | Sí hay **meses históricos** (selector de mes/año). |
| 2 | Huecos > 2 h | Evento de trazabilidad: admin «Sin transmisión»; monitoreo «Validar datos» (ver §4.5). |
| 2 | Huecos ≤ 2 h | **No** generan evento de hueco: el dato se **promedia** / integra en la serie horaria (ver §4.5). |
| 2 | Relleno huecos largos | Solo **admin**; algoritmo **PLI + LOCF** (§4.6): puntos **1/hora** con tendencia. |
| 2b | Apagados cortos | Solo cuentan apagados **≥ 8 minutos**. Menores = **falso apagado** (se descartan del análisis). |
| 2b | Falso apagado por suministro | Si `power_state=0` pero `|temp_supply_1 − set_point| ≤ 2 °C`, **no** es apagado real (el equipo mantiene temperatura). Se discrimina del cálculo general. |
| 2d | Vista monitoreo vs admin | **Monitoreo** solo ve eventos operativos (**apagado real**, **fuera de rango**, **DEFROST**) y sus horas, sin falsos positivos ni sin transmisión. **Admin** ve todo lo detectado (incl. falsos, sin TX y metadatos de descarte). |
| 2c | Fuera de rango cortos | Solo cuentan episodios **≥ 30 minutos**. Los menores de 30 min se **descartan** (no se listan ni suman horas). |
| 2c | Rango del análisis | Al analizar/regenerar se muestra y puede editar **set point + banda min/max** (ej. 14–16 → 12–18); se recalculan eventos con esa banda. |
| 3 | Persistencia | **PostgreSQL** (evaluación en §7.5). |
| 4 | UX de rangos | Vista de **rangos ya analizados**; si no hay → CTA **«Analizar este mes»**. |
| 4 | Inicio del mes sin datos | El análisis **no fuerza el día 1**: empieza desde el **primer día con datos** del mes. |
| 4 | Click en rango | Serie **~1 muestra/hora** + gráfica. |
| 5 | Cursor incremental | Sí, granularidad por **timestamp** del último punto procesado. |
| 5 | Regenerar mes | Solo **admin**. |
| 6 | Clasificación | **Monitoreo y admin** pueden clasificar eventos. |
| 7 | Export informe | **PDF**, **CSV** y **Excel** (.xlsx). |

---

## 1. Objetivo

1. Identificar equipo por **IMEI** + **código** (`TUNEL` | `STARCOOL` | `TERMOKING`).
2. Consultar historial oficial del mes (misma fuente que la gráfica de detalle).
3. Detectar intervalos: **apagado**, **fuera de rango** (rango programado), **sin transmisión de datos**.
4. Mostrar trazabilidad, resumen y desglose semanal (lunes → domingo).
5. Clasificar eventos (`autorizado` | `programado` | `no_previsto`) + detalle textual.
6. Persistir en BD con referencia estable; datos ya analizados no se recalculan salvo regeneración admin.
7. Reanálisis: continuar desde el último punto/día analizado.

---

## 2. Identificación del equipo

| Campo | Uso |
|-------|-----|
| `imei` | Identificador en telemetría |
| `codigo` | `TUNEL` / `STARCOOL` / `TERMOKING` |
| `rowKey` | `{codigo}-{imei}` |

Entrada: desde la pantalla de **detalle** del equipo ya abierto (contexto `imei` + `codigo`).

---

## 3. Ubicación en la UI y flujo

### 3.1 Entrada principal

Dentro de **detalle de telemetría** (`/listado/detalle?imei=…&codigo=…`):

- Nueva sección/pestaña: **Análisis de telemetría**.
- Selector de **mes / año** (actual + históricos).
- Roles: **monitoreo** y **admin** (respetando permisos de IMEI del usuario).

### 3.2 Si no hay análisis del mes

1. Mostrar estado vacío.
2. Botón **«Analizar este mes»**.
3. Al ejecutar:
   - Consultar historial del mes.
   - Si no hay datos desde el día 1 → `analizadoDesde` = **primera muestra existente** del mes.
   - Generar eventos + agregados semanales.
   - Guardar en BD.

### 3.3 Si ya hay análisis

- Listar **rangos analizados** (apagado, fuera de rango, sin transmisión).
- Indicador **Analizado hasta** (`analizadoHasta`).
- Botón **Actualizar análisis** (incremental desde cursor) para monitoreo y admin.
- Botón **Regenerar mes completo** solo admin.

### 3.4 Click en un rango

Al seleccionar un intervalo:

1. Cargar puntos del tramo **resumidos a ~1 dato por hora** (downsample / promedio o última muestra de la hora).
2. Mostrar tabla resumida + **gráfica** del tramo (mismas series base que el detalle: set point, suministro, retorno, etc.).
3. Formulario de clasificación + detalle (si el rol lo permite).

### 3.5 Enlace a gráfica general del detalle

Seguir disponible la gráfica completa del detalle; el análisis es capa operativa encima del mismo historial.

---

## 4. Criterios de detección de eventos

Alineados con correos (`logica_alertas.md`, `server/lib/historicalTelemetry.js`).

### 4.1 Rango programado

1. Rango personalizado del equipo → `return_air` vs `set_point ± márgenes`.
2. Si no → criterio estándar / ±10 % (igual alertas).
3. Defrost con ON ≠ fuera de rango.
4. Fuera de rango solo con equipo **ON**. OFF → evento **apagado**.

### 4.2 APAGADO

- `power_state === 0`.
- Utilidad existente: `computeApagadoIntervals`.

### 4.3 FUERA DE RANGO

- ON, no defrost efectivo, fuera de banda (`rowEnRangoParaAlerta` / misma que correos).
- Utilidad: `computeOutOfRangeIntervals`.
- **Filtro de duración:** solo episodios con duración **≥ 30 minutos** entran al análisis / UI. Los menores se descartan como transitorios (`MIN_FUERA_RANGO_MS`).

### 4.4 Relación con motor de correos

El análisis mensual **complementa** (no sustituye) episodios/umbrales/incidentes de correo:

- Reutilizar evaluación de rango/apagado.
- Enlazar incidentes de correo por solape temporal cuando existan.
- No reenviar correos desde esta UI.

### 4.5 Huecos de telemetría — umbral 2 horas (cerrado)

Entre dos muestras consecutivas válidas, sea `Δt = t_siguiente − t_anterior`:

| Δt | Tratamiento |
|----|-------------|
| **≤ 2 horas** | **No** se crea evento de hueco. Se entiende que el tramo corto se **promedia**: al construir la serie horaria (~1 pt/h), las muestras dentro de cada hora (o el segmento corto) se agregan por **media aritmética** de campos numéricos. Estados discretos (`power_state`): valor **mayoritario** en la ventana; empate → último valor conocido. |
| **> 2 horas** | Sí se crea evento de hueco en trazabilidad. |

Presentación del hueco largo (> 2 h):

| Rol | Etiqueta en UI |
|-----|----------------|
| **Admin** | **Sin transmisión de datos** (`since` / `until` / duración). |
| **Monitoreo** | Salto de tiempo etiquetado **Validar datos**. |

### 4.6 Algoritmo de interpolación (huecos > 2 h, solo admin)

**Nombre:** PLI + LOCF — *Piecewise Linear Interpolation* + *Last Observation Carried Forward* para estados.

**Por qué este algoritmo**

- Las temperaturas (set point, return, supply, evaporador, USDA/cargas, etc.) varían de forma aproximadamente continua: la **interpolación lineal horaria** entre ancla previa y ancla posterior reproduce la tendencia sin inventar picos (adecuado cuando hay día 21 y 23 y falta el 22).
- `power_state` y flags similares son **discretos**: no se promedian ni se interpolan a 0.5; se usa **LOCF** (se mantiene el estado de la ancla anterior hasta la ancla siguiente), salvo que ambas anclas coincidan en el mismo estado.
- Es auditable, determinista y barato de calcular; mejor que copiar el día anterior (ignora la ancla posterior) o splines (sobreajuste / complejidad innecesaria).

**Procedimiento**

1. Anclas: última muestra oficial **antes** del hueco y primera **después**.
2. Generar timestamps a **cada hora en punto** (minuto 0) estrictamente dentro `(ancla_antes, ancla_despues)`.
3. Para cada campo numérico continuo `v`:
   - `v(t) = v_antes + (v_despues − v_antes) * (t − t_antes) / (t_despues − t_antes)`
4. Para `power_state` (y análogos): `v(t) = v_antes` (LOCF). Si se requiere criterio distinto en UI, admin puede editar tras generar.
5. Persistir cada punto con `fuente = interpolado_admin`, `metodo = pli_locf_horaria`, anclas y autor.
6. Opcional: re-evaluar apagado / fuera de rango **solo en ese tramo** con los puntos interpolados + anclas.
7. **Nunca** se escriben de vuelta a la API oficial de telemetría ni alimentan el motor de correos automáticamente.

**Promedio en huecos cortos (≤ 2 h)** — distinto del relleno admin:

- No inserta puntos “inventados” en BD de interpolación.
- Solo afecta el **downsample horario** del análisis/export: media de muestras reales en la hora (o segmento).

---

## 4.7 Detección automática de DEFROST (patrón térmico)

Referencia de campo: `historial_defrost.csv` (IMEI `866262034780196`, 13/07/2026 ~16:00–16:33).

### Qué se observa en defrost
- El **evaporador** sube mucho más que **retorno** y **suministro** (está cerca de la resistencia).
- En el ejemplo: Evap de ≈ −8.5 °C → **+24.3 °C** mientras suministro sigue frío (≈ −7…−17) y retorno también sube (parece “fuera de rango”).
- Duración del ciclo en el ejemplo ≈ **33 min**; regla de producto: **máximo 60 min**.

### Regla en el análisis mensual
Sobre intervalos **fuera de rango** cerrados:

1. Si duración **≤ 60 min** y cumple patrón térmico (o flag `en_defrost` en telemetría) → clasificación automática **`defrost`** (`clasificado_por = sistema`).
2. Esos eventos se cuentan **aparte** (`eventosDefrost` / `horasDefrost`) y **no suman** en horas ni estadísticas de “fuera de rango”.
3. Si duración **> 60 min** → no se auto-clasifica como defrost (queda para revisión humana).
4. Clasificaciones humanas (`autorizado` / `programado` / `no_previsto`) **no se pisan** en reanálisis.

### Criterio de patrón (`server/lib/analisis/defrostPattern.js`)
- ≥ 1 muestra con `evaporation_coil > return_air` y `evaporation_coil > temp_supply_1`.
- Subida de evaporador ≥ 5 °C respecto al inicio del intervalo.
- Pico de evaporador ≥ suministro + 3 °C.
- O bien suficientes puntos con `en_defrost = true`.

### Piezas acopladas
| Pieza | Cambio |
|-------|--------|
| Enum clasificación BD/UI | + `defrost` |
| Motor mensual | `classifyFueraIntervalsWithDefrost` |
| Semanas | columna y horas **DEFROST** aparte; **no** en fuera de rango |
| UI | badge DEFROST + opción en selector |

---

### 5.1 Cabecera

- IMEI, código, nombre, mes/año, GMT-5.
- Snapshot de rango programado usado.
- `analizadoDesde` / `analizadoHasta`.
- CTA actualizar / regenerar (según rol).

### 5.2 Listas de rangos

Tipos: `apagado` | `fuera_rango` | `sin_transmision` (admin) / presentación `validar_datos` (monitoreo).

| Campo | Descripción |
|-------|-------------|
| `since` / `until` | Intervalo |
| `durationHours` | Duración |
| `clasificacion` | autorizado / programado / no_previsto |
| `detalle` | Texto libre |
| `refsCorreo` | Incidentes de correo relacionados (opcional) |

### 5.3 Semanas (lunes → domingo, GMT-5)

| Semana | Desde | Hasta | Horas fuera de rango | Horas apagado | Horas sin transmisión |
|--------|-------|-------|----------------------|---------------|------------------------|
| S1… | lun | dom | … | … | … |

Intervalos que cruzan semanas se parten en la frontera lunes 00:00.

### 5.4 Detalle al click (~1 h)

Serie horaria del tramo + gráfica embebida + clasificación.

### 5.5 Export del reporte

Desde el análisis del mes, **monitoreo y admin** pueden exportar:

| Formato | Contenido típico |
|---------|------------------|
| **PDF** | Cabecera del equipo/mes, resumen, tabla semanal, listado de rangos (con clasificación/detalle), nota de puntos interpolados si existen. |
| **CSV** | Filas planas: eventos y/o serie semanal (separador `,` o `;`, UTF-8). |
| **Excel** (.xlsx) | Hojas: `Resumen`, `Semanas`, `Eventos`, opcional `SerieHoraria` / `Interpolados`. Reutilizar stack existente `xlsx` en servidor. |

Los exports deben marcar claramente filas/puntos `interpolado_admin` vs telemetría oficial.

---

## 6. Clasificación humana

| Campo | Valores |
|-------|---------|
| `clasificacion` | `autorizado` \| `programado` \| `no_previsto` \| `sin_clasificar` |
| `detalle` | Texto libre |
| `autor` / `actualizadoAt` | Auditoría |

**Monitoreo y admin** pueden clasificar y editar el detalle. La clasificación es **opcional** (puede quedar `sin_clasificar`). Reanálisis incremental **no borra** clasificaciones existentes.

---

## 7. Persistencia (BD real) e incrementalidad

### 7.1 Principio

Tramos ya analizados son inmutables salvo:

- **Actualización incremental** (solo ventana nueva), o
- **Regenerar mes completo** (solo admin).

### 7.2 Granularidad del cursor

- `analizadoHasta` = **timestamp** del último punto (o fin de hora) procesado con éxito.
- Al actualizar: ventana `(analizadoHasta, ahora/fin_mes]`.
- Si el mes aún no tiene datos al día 1: `analizadoDesde` = timestamp de la primera muestra real.

### 7.3 Entidades (BD)

**`analisis_mensual`**

| Campo | Descripción |
|-------|-------------|
| `id` | UUID referencia |
| `imei`, `codigo`, `row_key` | Equipo |
| `anio`, `mes` | Periodo |
| `zona_horaria` | `GMT-5` |
| `rango_config_snapshot` | JSON márgenes |
| `analizado_desde`, `analizado_hasta` | Timestamps |
| `estado` | `parcial` \| `cerrado_mes` |
| `created_at`, `updated_at` | Auditoría |

Único lógico recomendado: (`imei`, `codigo`, `anio`, `mes`).

**`analisis_evento`**

| Campo | Descripción |
|-------|-------------|
| `id` | UUID |
| `analisis_id` | FK |
| `tipo` | `apagado` \| `fuera_rango` \| `sin_transmision` |
| `since`, `until`, `duration_hours` | Intervalo |
| `clasificacion`, `detalle` | Anotación |
| `hash_intervalo` | Idempotencia |

**`analisis_semana`**

Agregados lun–dom: horas fuera / apagado / sin transmisión.

**`analisis_punto_interpolado`** (relleno admin)

| Campo | Descripción |
|-------|-------------|
| `id` | UUID |
| `analisis_id` | FK |
| `ts` | Hora del punto |
| `payload` | JSON temperaturas / power_state, etc. |
| `metodo` | `pli_locf_horaria` |
| `ancla_antes_ts`, `ancla_despues_ts` | Contexto |
| `creado_por`, `creado_at` | Auditoría |

**`analisis_evento_serie_hora`** (cache opcional del click)

Puntos ~1/h del tramo para no recalcular siempre.

### 7.4 Reanálisis

1. Buscar análisis por (`imei`, `codigo`, `anio`, `mes`).
2. No existe → analizar desde primera muestra del mes → guardar.
3. Existe → delta desde `analizado_hasta` → fusionar eventos (preservar clasificaciones) → actualizar cursor.
4. Admin **Regenerar mes**: borra/recrea eventos no protegidos según política (definir si se conservan clasificaciones por `hash` solapado) y recalcula todo el mes.

### 7.5 Motor de BD — evaluación y elección: PostgreSQL

Contexto actual: Express + JSON en volumen Docker (`correo-data`), sin BD previa; exports Excel ya tienen dependencia `xlsx`.

| Criterio | PostgreSQL | MySQL | SQLite |
|----------|------------|-------|--------|
| Concurrencia (varios monitoreo/admin clasificando) | Excelente | Buena | Débil (escrituras) |
| Consultas por rango temporal / índices | Excelente | Buena | Aceptable |
| JSON (snapshot márgenes, payload interpolado) | **JSONB** nativo | JSON | Texto/JSON1 |
| Encaje Docker Compose | Servicio oficial maduro | Similar | Archivo en volumen (simple) |
| Operación / backups | Estándar industria | Estándar | Copia de archivo |
| Encaje a escala (más IMEI / meses) | Mejor | Bien | Se queda corto |

**Elección: PostgreSQL 16+**

- Encaja con análisis mensual, eventos, puntos interpolados y exports concurrentes.
- `JSONB` para `rango_config_snapshot` y `payload` de interpolación.
- Índices naturales: `(imei, codigo, anio, mes)`, `(analisis_id, tipo)`, `(since, until)`.
- Se añade servicio `postgres` en `docker-compose.yml` + volumen persistente (junto al volumen actual de correo).
- Acceso desde Node: `pg` (o Prisma/Drizzle si se prefiere ORM).

SQLite solo se consideraría como modo “dev embebido”; **no** como producción de este módulo.

---

## 8. Flujo resumido

```
[Detalle equipo → pestaña Análisis de telemetría]
        ↓
[Elegir mes histórico o actual]
        ↓
¿Hay analisis_mensual?
  No → [Analizar este mes] desde 1.ª muestra con datos
  Sí → mostrar rangos + [Actualizar] / [Regenerar](admin)
        ↓
[Detectar apagado | fuera de rango | huecos >2h]
        ↓
[Huecos ≤2h → promediar en serie horaria]
[Admin puede PLI+LOCF en huecos >2h]
        ↓
[Click rango → serie ~1h + gráfica + clasificación]
        ↓
[Export PDF / CSV / Excel]
        ↓
[Persistir en PostgreSQL]
```

---

## 9. Consideraciones de implementación

### 9.1 Reutilizar

- `computeOutOfRangeIntervals`, `computeApagadoIntervals`
- Config rango por equipo
- `fetchBuscarDatosOficiales` / historial servidor
- Zona GMT-5
- Permisos `userMayAccessDispositivo` + rol admin vs monitoreo

### 9.2 Permisos UI

| Acción | Monitoreo | Admin |
|--------|-----------|-------|
| Ver análisis / meses históricos | Sí (IMEI permitidos) | Sí |
| Analizar / actualizar incremental | Sí | Sí |
| Clasificar eventos + detalle | Sí | Sí |
| Export PDF / CSV / Excel | Sí | Sí |
| Ver hueco como «Sin transmisión» | No | Sí |
| Ver eventos/horas sin información | No | Sí |
| Interpolar / rellenar huecos (PLI+LOCF) | No | Sí |
| Regenerar mes completo | No | Sí |

### 9.3 Riesgos

- Distinguir siempre telemetría oficial vs puntos interpolados en gráfica, tabla y exports.
- Huecos exactamente en el límite de 2 h: usar `Δt > 2 h` (estrictamente mayor) como evento; `Δt ≤ 2 h` promedia.
- Cambio de márgenes a mitad de mes (snapshot en cabecera).
- No contaminar API oficial ni el motor de correos con datos interpolados.

### 9.4 API borrador

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/analisis/mensual/run` | Analizar / actualizar |
| POST | `/api/analisis/mensual/:id/regenerar` | Solo admin |
| GET | `/api/analisis/mensual?imei&codigo&anio&mes` | Cabecera + eventos |
| GET | `/api/analisis/eventos/:eventoId/serie` | Serie ~1 h + para gráfica |
| PATCH | `/api/analisis/eventos/:eventoId` | Clasificación + detalle |
| POST | `/api/analisis/huecos/:eventoId/interpolar` | Solo admin (PLI+LOCF) |
| GET | `/api/analisis/mensual/:id/export.pdf` | Export PDF |
| GET | `/api/analisis/mensual/:id/export.csv` | Export CSV |
| GET | `/api/analisis/mensual/:id/export.xlsx` | Export Excel |

---

## 10. Pendiente menor (ya no bloquea el diseño)

1. **Incidentes de correo**: ¿solo enlace por solape, o también panel de correos en el informe?
2. **Regenerar mes**: ¿conservar clasificaciones si el nuevo intervalo solapa el `hash` anterior? (propuesta: sí, reasignar por solape ≥ 50 % de duración).
3. Tabla semanal: incluir las tres métricas (fuera / apagado / sin transmisión) — **propuesta por defecto: sí**.

---

## 11. Referencias de código existente

| Tema | Ubicación |
|------|-----------|
| Correos fuera de rango | `logica_alertas.md`, `server/lib/alertEngine.js` |
| Intervalos fuera / apagado | `server/lib/historicalTelemetry.js` |
| Rango personalizado | `rangoTemperatura` (cliente/servidor) |
| Historial + gráfica | `datosOficiales.ts`, `HistorialOficialDetalle.tsx`, `HistorialReeferChart.tsx` |
| Roles / permisos | `userPermissions.ts`, `AuthContext` |
| Listado por código | `LOGICA_LISTADO_DATOS.MD` |

---

## 12. Estado de implementación (código)

Ya existe una primera versión:

| Pieza | Ubicación |
|-------|-----------|
| Esquema SQL | `server/sql/001_analisis.sql` |
| Pool PG + migrate | `server/lib/db.js` |
| Motor run/get/serie/interpolar | `server/lib/analisis/` |
| API | `/reefer/api/analisis/*` (montada en `emailServer.mjs`) |
| UI | `AnalisisTelemetriaPanel` en detalle de equipo |
| Docker | servicio `postgres` en `docker-compose.yml` (`DATABASE_URL`) |

**Pendiente / pulir:** PDF servidor (ahora PDF en cliente), refinamiento del merge incremental, tests, y puntos §10.

