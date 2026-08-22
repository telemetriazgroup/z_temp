# Detalle de equipo: gráfica y tabla dinámicas

Documento de evaluación e implicancias de implementar [`manejo_tabla_grafica.md`](./manejo_tabla_grafica.md) en la vista de **detalle del dispositivo** (`/listado/detalle` → historial oficial).

Fecha: 2026-08-22.

---

## 1. Objetivo del cambio

Hoy el detalle muestra un historial **único para todos** los orígenes (TUNEL / STARCOOL / TERMOKING): mismas series por defecto en gráfica y mismas columnas en tabla. La especificación pide:

1. **Catálogo de campos** con etiqueta, rango válido y destino (gráfica / tabla).
2. **Tres perfiles de máquina** (REEFER, TUNEL, MADURADOR) con columnas y series predefinidas.
3. **Perfil personalizado por usuario × dispositivo** (persistido).
4. **Tres ejes Y**: temperaturas (izq.), porcentajes (der.), rangos altos tipo etileno (der.).
5. Fuera de rango → **NA** en tabla y **null** en gráfica (no se dibuja el punto).

Resultado esperado: al abrir un equipo, cada usuario ve gráfica/tabla según su configuración de ese IMEI, sin afectar a otro usuario del mismo equipo.

---

## 2. Estado actual (baseline)

| Pieza | Situación |
|-------|-----------|
| Entrada | `EquipoDetalle` / `EquipoDetalleIffLayout` → `HistorialOficialDetalle` |
| Gráfica | `HistorialReeferChart` + `historialChartConfig.ts` |
| Tabla / export | `historialOficial.ts` (`TABLA_HISTORIAL_COLUMNAS`, `celdaHistorial`) + `exportHistorial.ts` |
| Ejes | Solo **Y1 temp** + **Y2 %** (humedad); **no hay Y3** |
| Series default visibles | Retorno, Suministro, Evaporador, Set |
| Series opcionales (leyenda) | Humedad, Ambiente, USDA 1–4 |
| Persistencia de vista | **No**: toggles de leyenda solo en `useState` de sesión |
| Preferencias de usuario | `temperaturaUnidad`, zona; **no** series/columnas por IMEI |
| `codigo` del equipo | Origen de API (`TUNEL`/`STARCOOL`/…), **no** perfil REEFER/TUNEL/MADURADOR |
| Validación de rangos | Parcial (USDA ≈ −30…24; CO₂/O₂ en tarjetas, no en historial) |
| °C / °F | Tabla respeta preferencia; **gráfica y exports quedan en °C** |

Archivos clave:

- `src/app/components/HistorialOficialDetalle.tsx`
- `src/app/components/HistorialReeferChart.tsx`
- `src/app/lib/historialChartConfig.ts`
- `src/app/lib/historialOficial.ts`
- `src/app/types.ts` → `DatoOficialHistorial` (subset; faltan muchos campos del catálogo)

---

## 3. Matriz: especificación vs implementación

### 3.1 Campos del catálogo

Leyenda: ✅ existe · ⚠️ parcial · ❌ ausente en historial gráfica/tabla.

| Campo API | Nombre UI | Spec G/T | Hoy |
|-----------|-----------|----------|-----|
| `temp_supply_1` | Suministro | G+T | ✅ gráfica + tabla |
| `temp_supply_2` | Suministro 2 | G+T | ❌ |
| `return_air` | Retorno | G+T | ✅ |
| `evaporation_coil` | Evaporador | G+T | ✅ |
| `condensation_coil` | Condensador | G+T | ❌ |
| `compress_coil_1` | Compresor | G+T | ❌ (sí en tarjetas live) |
| `ambient_air` | Exterior | G+T | ⚠️ gráfica off por defecto; tabla “Aire ambiente” |
| `cargo_1..4_temp` | USDA 1–4 | G+T | ⚠️ gráfica off; tabla sí; rango USDA distinto al spec (−40…50) |
| `relative_humidity` | Humedad | G+T | ⚠️ gráfica off; tabla sí; rango 20–99 no aplicado |
| `avl` | AVL | T | ❌ |
| `line_voltage` / `line_frequency` | Voltaje / Frecuencia | T | ✅ tabla |
| `consumption_ph_1..3` | Fase 1–3 | T | ✅ tabla |
| `co2_reading` / `o2_reading` | CO2 / O2 | G+T | ❌ historial (sí en detalle live / CA) |
| `evaporator_speed` / `condenser_speed` | Ventilación Evap./Cond. | T | ❌ |
| `battery_voltage` | V Batería (÷10 si >10) | T | ❌ |
| `power_kwh` | Contador eléctrico | T | ❌ |
| `supply_air_temp` / `return_air_temp` | Sensores aire | T | ❌ |
| `dl_battery_temp` | Temp. batería | T | ❌ |
| `power_consumption` / `_avg` | Consumo / promedio | T | ❌ |
| `alarm_present` / `numero_alarma` / `alarma_01..02` | Alarmas | T | ❌ |
| `set_point` | Set Temperatura | G+T | ✅ |
| `capacity_load` | Potencia Compresor | G+T | ❌ |
| `power_state` (+ regla fases >0.5) | Power | T | ❌ |
| `controlling_mode` / `humidity_control` / `fresh_air_ex_mode` | Modos | T | ❌ |
| `humidity_set_point` | Set Humedad | G+T | ❌ |
| `set_point_o2` / `set_point_co2` | Set O2/CO2 | G+T | ❌ |
| `defrost_term_temp` / `defrost_interval` | Defrost | T | ❌ |
| `sp_ethyleno` / `ethylene` | SP/Etileno | G+T | ❌ |
| `inyeccion_hora` | Horas inyección | T | ❌ |
| `fecha` / `created_at` | Fecha | eje X + T | ✅ |

### 3.2 Perfiles predefinidos

| Perfil | Spec gráfica ON | Spec tabla ON | Hoy |
|--------|-----------------|---------------|-----|
| **REEFER** | supply, return, evap, set | + compressor, exterior, USDA×4, V/f, fases, humedad | Cercano a defaults de gráfica; tabla sin compressor |
| **TUNEL** | USDA1–3, return, set | Similar a REEFER (sin humidity en lista? spec sí incluye humidity) | No: USDA no ON por defecto |
| **MADURADOR** | ethylene, CO2, humedad, return, set | + controlling_mode, ethylene, CO2, avl | No existe |

`codigo` TUNEL ≠ perfil TUNEL: un equipo con origen TUNEL puede ser reefer de patio; el perfil debe ser **elección de usuario** (con sugerencia opcional), no el origen de API.

### 3.3 Personalización y persistencia

| Requisito | Implicancia |
|-----------|-------------|
| Preset o CUSTOM | UI “Configurar vista” en historial/detalle |
| Clave `usuario + imei` (+ opcional `codigo`) | Dos usuarios del mismo IMEI ven configs distintas |
| Cargar al abrir detalle | Fetch antes o en paralelo al historial |
| Guardar al confirmar | PUT API + invalidar caché local |

---

## 4. Implicancias técnicas

### 4.1 Nuevo dominio: catálogo + sanitización

Crear módulo (propuesto) `src/app/modules/historialVista/` o `src/app/lib/historialPerfiles/`:

```
FieldDef {
  key, labelEs,
  chartable, tableable,
  axis: 'temp' | 'pct' | 'high' | null,  // null = solo tabla
  min, max, unit,
  transform?: 'battery_div10' | 'power_state_override' | ...
}
```

Funciones:

- `sanitizeTable(value, def)` → `number | 'NA' | '—'`
- `sanitizeChart(value, def)` → `number | null`
- `applyPowerState(row)` → ON si `power_state===1` **o** alguna fase > 0.5
- `presets: Record<'REEFER'|'TUNEL'|'MADURADOR', { chartKeys, tableKeys }>`

**Implicancia:** dejar de hardcodear `HISTORIAL_CHART_SERIES` y `TABLA_HISTORIAL_COLUMNAS` como única fuente; pasan a ser *defaults* o se generan desde el catálogo + prefs.

### 4.2 Tipos y payload oficial

Ampliar `DatoOficialHistorial` con todos los keys del catálogo (nullable). Verificar que `buscar_datos_oficiales` (Tunel/Starcool/Termoking) **ya devolvió** ethylene/CO2/etc.; si no, MADURADOR no tendrá datos aunque la UI lo permita.

**Implicancia:** QA por origen de API; no asumir que STARCOOL2 trae etileno.

### 4.3 Gráfica (Y1 / Y2 / Y3)

| Eje | Contenido | Cambio en `HistorialReeferChart` |
|-----|-----------|----------------------------------|
| Y1 izq. | Temperaturas (°C/°F según usuario) | Convertir series temp si unidad = F |
| Y2 der. | % (humedad, CO2, O2, capacity_load, sets %) | Ya existe; ampliar series |
| Y3 der. | Etileno / SP etileno (0–300) | Nuevo `yAxisId="high"`, offset para no solapar Y2 |

**Implicancias UI:**

- Leyenda debe listar solo series del perfil (chartable ∩ seleccionadas).
- Si no hay series en Y2/Y3, ocultar ese eje (como hoy con %).
- Brush/zoom debe seguir usando el mismo dataset filtrado.
- Modal 3 h (`Historial3hModal`) debe reutilizar el mismo config.

### 4.4 Tabla dinámica

Columnas = `tableKeys` del perfil/custom, siempre con Fecha primera.

**Implicancias:**

- Paginación y anchos: muchas columnas (MADURADOR / custom) → scroll horizontal ya existente; valorar columnas fijas (Fecha).
- Tendencias (flechas) hoy solo en retorno/suministro: decidir si se mantienen solo para esas o se desactivan en columnas nuevas.
- Exports CSV/XLSX/PDF/JSON deben usar **las mismas columnas visibles** del usuario (no el set fijo actual).

### 4.5 Persistencia (servidor)

Propuesta de modelo:

```json
{
  "username": "ransa.admin",
  "imei": "867858038958891",
  "codigo": "TUNEL",
  "preset": "REEFER",
  "chartKeys": ["temp_supply_1", "return_air", "evaporation_coil", "set_point"],
  "tableKeys": ["temp_supply_1", "return_air", "..."],
  "updatedAt": "ISO"
}
```

- Archivo JSON o tabla Postgres (alineado a `users` / correo API).
- Endpoints sugeridos bajo `/reefer/api/correo/...` o `/reefer/api/historial-vista`:
  - `GET ?imei=&codigo=`
  - `PUT` body prefs
- Autorización: solo el propio usuario (o superadmin lectura).

**Implicancia de producto:** ¿el admin puede forzar preset a sus monitores? Spec dice por usuario; por defecto **no heredar**.

### 4.6 Relación con Listado / Inicio / Análisis

| Módulo | Impacto |
|--------|---------|
| Listado | Sin cambio obligatorio (sigue columnas fijas live) |
| Tarjetas detalle live | Opcional alinear nombres/rangos con el catálogo (consistencia) |
| Análisis telemetría | Independiente; no reutilizar prefs salvo decisión explícita |
| Alarmas / correo | No usan este perfil |
| i18n | Labels del catálogo deben entrar a `es.ts` / `en.ts` |

### 4.7 Rendimiento

- Sanitizar N puntos × M series en cliente es barato para ventanas de 12 h–días.
- Preferencia: un GET pequeño al abrir detalle; cachear en memoria por sesión (`Map[imei]`).
- No refetch de historial solo por cambiar leyenda; sí al cambiar columnas de tabla (re-render local).

### 4.8 Reglas especiales a no olvidar

1. **Batería:** `> 10` → dividir entre 10; luego validar 0–12.
2. **Power:** override a ON si fases > 0.5 aunque `power_state === 0`.
3. **Contador kWh:** válido solo si `> 0.1`.
4. **Humedad / sets humedad:** mínimo 20 (valores 0–19 → NA/null).
5. **Fecha:** `fecha ?? created_at` (ya parcialmente hecho).

---

## 5. Flujo UX propuesto en detalle

1. Usuario abre `/listado/detalle?imei=…&codigo=…`.
2. Carga telemetría live + historial (como hoy) **y** prefs de vista.
3. Si no hay prefs: aplicar sugerencia (REEFER por defecto, o heurística: ethylene/CO2 → MADURADOR; muchos USDA → TUNEL) y/o primer uso con modal “Elegir perfil”.
4. Gráfica/tabla se renderizan con keys del perfil.
5. Botón **Configurar vista**:
   - Elegir REEFER / TUNEL / MADURADOR / Personalizado.
   - Checkboxes: “En gráfica” (solo `chartable`) y “En tabla” (`tableable`).
   - Guardar → PUT → toast → re-render.
6. Toggles de leyenda siguen siendo sesión (opcional: persistir también “última leyenda”).

---

## 6. Plan de implementación sugerido (fases)

| Fase | Alcance | Riesgo |
|------|---------|--------|
| **A** | Catálogo + sanitización + tipado `DatoOficialHistorial` | Bajo |
| **B** | Perfiles REEFER/TUNEL/MADURADOR hardcodeados (sin persistencia); selector local | Medio |
| **C** | Y3 + series ethylene/CO2/capacity/humidity set; °F en gráfica | Medio |
| **D** | API persistencia usuario×IMEI + UI Configurar vista | Medio–alto |
| **E** | Exports y Historial3h alineados; i18n; pruebas por origen API | Bajo |

No mezclar perfil de máquina con `DispositivoOrigenCodigo`: mantener origen para ruteo de `buscar_datos_oficiales`.

---

## 7. Riesgos y decisiones abiertas

1. **¿Qué series son “posibilidad de graficar” en cada perfil?** El texto lista ON por defecto; el resto del catálogo `chartable` debería estar disponible en personalizado y, en presets, como opt-in en leyenda/config.
2. **USDA rango:** spec −40…50 vs código actual −30…24 → alinear a spec o documentar excepción de negocio.
3. **Tabla TUNEL** en spec es casi igual a REEFER; confirmar si es intencional.
4. **Migración:** usuarios existentes sin prefs → default REEFER (comportamiento cercano al actual).
5. **Superadmin** viendo flota ajena: ¿usa su propia preferencia por IMEI o un default global? Recomendación: prefs del actor logueado.

---

## 8. Conclusión

La base actual (historial oficial + gráfica dual + tabla fija) cubre ~el 30–40 % del catálogo y **un solo** estilo tipo REEFER. Para cumplir `manejo_tabla_grafica.md` hace falta:

- un **catálogo normativo** (rangos NA/null),
- **tres presets + custom**,
- **persistencia por usuario y dispositivo**,
- **tercer eje Y** y más series,
- y desacoplar **perfil de máquina** del **origen de telemetría**.

Este documento es la referencia de diseño antes de codificar; al implementar, actualizar aquí el estado de cada fase.

---

## 9. Estado de implementación (2026-08-22+)

| Fase | Estado | Notas |
|------|--------|-------|
| **A** | Hecho | `src/app/modules/historialVista/` (catálogo, sanitize, tipado) |
| **B** | Hecho | Presets REEFER / TUNEL / MADURADOR + CUSTOM |
| **C** | Hecho | Y3 (`high`), °F en gráfica, series dinámicas |
| **D** | Hecho | `GET/PUT /reefer/api/correo/historial-vista` + localStorage + diálogo Configurar vista |
| **E** | Hecho | Exports y `Historial3hModal` usan `tableKeys` / `chartKeys` del usuario |

Pendiente menor: i18n de labels del catálogo; QA por origen API (ethylene/CO2).
