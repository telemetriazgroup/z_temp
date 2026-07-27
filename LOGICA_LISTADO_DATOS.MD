# Lógica de listado por origen (TUNEL / STARCOOL / TERMOKING)

## Fuente de datos
- Pantalla **Listado** (`src/app/pages/Listado.tsx`).
- Carga agregada: `fetchUltimoEstadoDispositivos()` en `src/app/api/termoking.ts`.
- Tres orígenes en paralelo (`Promise.allSettled`). Si uno falla, se muestran los demás; solo falla total si ninguno responde.
- Cada dispositivo recibe en cliente el campo `codigo`: `TUNEL` | `STARCOOL` | `TERMOKING`.

## Endpoints por código

| Código | Base | Endpoint último estado |
|--------|------|------------------------|
| **TUNEL** | `telemetria/tunel-termoking` | `GET …/Tunel/ultimo_estado_dispositivos/` |
| **STARCOOL** | `telemetria/starcool` | `GET …/Starcool/ultimo_estado_dispositivos/` |
| **TERMOKING** | `telemetria/tunel-termoking` | `GET …/TermoKing/ultimo_estado_dispositivos/` |

Bases relativas (prefijo SPA, ej. `/reefer/`): `src/app/api/telemetryBases.ts`.  
Overrides opcionales: `VITE_TUNEL_API_BASE`, `VITE_STARCOOL_API_BASE`, `VITE_TUNEL_ULTIMO_ESTADO_URL`, `VITE_STARCOOL_ULTIMO_ESTADO_URL`, `VITE_TERMOKING_ULTIMO_ESTADO_URL`.

## Flujo de carga
1. Al abrir Listado → se piden las 3 APIs + mapa de config de alertas (rango personalizado).
2. Se etiquetan dispositivos con `codigo` y se unen en un solo array.
3. Se fusionan los `resumen` (sumas de online/wait/offline/power/defrost).
4. Se sincronizan alarmas desde telemetría (`syncDeviceAlarmsFromTelemetry`).
5. Filtro por permisos de usuario → filas visibles → filtros UI (código, status, búsqueda).

## Visibilidad por usuario
- **IMEI:** `deviceAccess` (`all` o lista). Superusuario ve todo.
- **Código (origen):** si el perfil tiene `allowedCodigos` (ej. solo `['TUNEL']`), solo ve esos orígenes.
- Función: `userMayAccessDispositivo()` en `src/app/modules/usuario/userPermissions.ts`.
- Resumen superior: si el usuario no es global, se recalcula solo con dispositivos visibles (`resumenFromDispositivos`).

## Filtros en UI
| Filtro | Valores | Comportamiento |
|--------|---------|----------------|
| **Código** | Todos / TUNEL / STARCOOL / TERMOKING | `device.codigo === filtro` |
| **Estado** | Todos / Online / Wait / Offline | según `estado_conexion` |
| **Búsqueda** | texto | IMEI, código o nombre asignado |

Contadores por código se calculan sobre dispositivos **visibles** (ya filtrados por permisos).

## Columnas del listado (mapeo de datos)

| Columna | Origen |
|--------|--------|
| Código | `codigo` (asignado en cliente) |
| Status | `estado_conexion` → ONLINE / WAIT / OFFLINE |
| Power | `power_state_texto` → ON / OFF |
| Container ID / IMEI | `imei` |
| Nombre | `deviceNames` del perfil, o nombre local/servidor por `rowKey` (`codigo-imei`) |
| Última conexión | `ultima_actualizacion` |
| Set point | `ultimo_dato.set_point` |
| Return air | `ultimo_dato.return_air` |
| Temp. suministro | `ultimo_dato.temp_supply_1` |
| En rango | ver sección siguiente |
| Alarmas | códigos activos en `ultimo_dato` (catálogo MP4000) |
| Ubicación | `latitud` / `longitud` (0,0 o null = sin ubicación) |

Clave de fila: `rowKey = codigo-imei` (si hay código).

## En rango (columna)
1. Equipo **apagado** (`power_state = 0` / `power_state_texto = off`) → **APAGADO** (prioridad).
2. Si no está claramente ON → indeterminado (`—`).
3. Con **rango personalizado** (config alertas): `return_air` vs setpoint ± márgenes; defrost con ON cuenta como en rango.
4. Sin personalización: se usa `en_rango` de la API.
5. Resultado UI: NORMAL | FUERA DE RANGO | APAGADO | —.

Lógica: `evaluarEstadoRangoListado()` en `src/app/modules/correo/rangoTemperatura.ts`.

## Navegación al detalle
- Clic en fila → `/listado/detalle?imei=…&codigo=TUNEL|STARCOOL|TERMOKING` (state con el dispositivo).
- Historial oficial (tabla/gráfica) usa el mismo `codigo` para elegir endpoint:
  - TUNEL → `…/Tunel/buscar_datos_oficiales/{imei}`
  - TERMOKING → `…/TermoKing/buscar_datos_oficiales/{imei}`
  - STARCOOL → `…/Starcool/buscar_datos_oficiales/{imei}`

---

# Estructura de datos (`ultimo_estado_dispositivos`)

## Respuesta raíz
```json
{
  "data": {
    "resumen": { /* ResumenDispositivos */ },
    "dispositivos": [ /* DispositivoUltimoEstado[] */ ]
  }
}
```

## `resumen`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `total_dispositivos` | number | Cantidad de equipos en esa fuente |
| `online` | number | Conexión online |
| `wait` | number | Conexión wait |
| `offline` | number | Conexión offline |
| `en_defrost` | number | En defrost |
| `power_on` | number | Power ON |
| `power_off` | number | Power OFF |
| `zona_horaria` | string | Ej. `"GMT-5"` |

## `dispositivos[]` (ítem)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `imei` | string | Identificador del equipo |
| `estado_conexion` | `"online"` \| `"offline"` \| `"wait"` | Estado de enlace |
| `ultima_actualizacion` | string \| null | ISO de último dato |
| `minutos_desde_ultimo_dato` | number \| null | Antigüedad del último reporte |
| `power_state_texto` | `"on"` \| `"off"` \| null | Power legible |
| `en_rango` | boolean \| null | En rango según telemetría |
| `en_defrost` | boolean \| null | Defrost activo |
| `ultimo_dato` | object | Telemetría más reciente |
| `codigo` | `"TUNEL"` \| `"STARCOOL"` \| `"TERMOKING"` | **Solo en cliente** tras fusionar fuentes |

## `ultimo_dato`
| Campo | Tipo | Uso en listado / detalle |
|-------|------|---------------------------|
| `set_point` | number \| null | Set point |
| `return_air` | number \| null | Aire de retorno |
| `temp_supply_1` | number \| null | Temp. suministro |
| `evaporation_coil` | number \| null | Evaporador |
| `condensation_coil` | number \| null | Condensador |
| `compress_coil_1` | number \| null | Compresor |
| `co2_reading` / `o2_reading` | number \| null | Gases |
| `set_point_co2` / `set_point_o2` | number \| null | Setpoints gases |
| `cargo_1_temp` … `cargo_4_temp` | number \| null | Sensores cargo / USDA |
| `power_kwh` | number \| null | Consumo |
| `numero_alarma` | number \| null | Alarma principal |
| `alarma_01` … `alarma_12` | number \| null | Slots adicionales (túnel / MP4000) |
| `sp_ethyleno` | number \| null | Etileno |
| `power_state` | number \| null | `1` = ON, `0` = OFF |
| `capacity_load` | number \| null | Carga |
| `telemetria_id` | number \| null | Id registro |
| `created_at` | string \| null | Fecha del dato |
| `latitud` / `longitud` | number \| null | GPS |

## Ejemplo de dispositivo
```json
{
  "imei": "867858039045086",
  "estado_conexion": "online",
  "ultima_actualizacion": "2026-04-29T21:29:59.208000",
  "minutos_desde_ultimo_dato": 0.3,
  "power_state_texto": "on",
  "en_rango": true,
  "en_defrost": false,
  "codigo": "TUNEL",
  "ultimo_dato": {
    "temp_supply_1": -23.5,
    "return_air": -22,
    "evaporation_coil": -23.5,
    "condensation_coil": 0,
    "compress_coil_1": null,
    "co2_reading": 25.5,
    "o2_reading": 25.5,
    "cargo_1_temp": 0,
    "cargo_2_temp": 0,
    "cargo_3_temp": 0,
    "cargo_4_temp": 0,
    "power_kwh": 0,
    "numero_alarma": null,
    "sp_ethyleno": 0,
    "set_point_o2": 0,
    "set_point_co2": 0,
    "power_state": 1,
    "capacity_load": 0,
    "telemetria_id": 15885,
    "created_at": "2026-04-29T21:29:59.208000",
    "longitud": 0,
    "latitud": 0,
    "set_point": -22
  }
}
```

## Referencia de código
| Pieza | Archivo |
|-------|---------|
| Fetch + merge 3 orígenes | `src/app/api/termoking.ts` |
| Bases / proxy | `src/app/api/telemetryBases.ts` |
| Tipos | `src/app/types.ts` (`DispositivoUltimoEstado`, `UltimoDatoDispositivo`) |
| UI listado + filtros | `src/app/pages/Listado.tsx` |
| Permisos IMEI/código | `src/app/modules/usuario/userPermissions.ts` |
| En rango | `src/app/modules/correo/rangoTemperatura.ts` |
| Historial por código | `src/app/api/datosOficiales.ts` |
