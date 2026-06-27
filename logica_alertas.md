# Lógica de alertas fuera de rango (correo)

## Fuente de datos
- Consulta historial 12 h (JSON `datos`, ordenado de menor a mayor por `created_at` / `fecha`).
- Campos analizados: `set_point`, `return_air`, `temp_supply_1`, `evaporation_coil`.
- **Guía para alertas:** `return_air` vs setpoint ± márgenes (estándar ±10 %, personalizado según equipo).

## Intervalos / incidentes
1. Fuera de rango → se registra `since` (inicio del intervalo continuo actual).
2. En rango → se cierra el incidente, se anula la referencia y **se reinician los umbrales enviados** (2 h, 3 h…).
3. Nuevo fuera de rango → nuevo incidente con contador desde cero.
4. Cada ciclo revalida el historial (no se congela la referencia sin consultar).

## Envío de correos
- Solo con equipo **ON** (`power_state = 1`).
- Defrost con equipo ON no cuenta como fuera de rango.
- Opcional por equipo: alerta a **30 min** y/o **1 h**, además de 2 h, 3 h…
- Las horas fuera de rango se cuentan hasta la **última comunicación** del equipo, no más allá (evita 5 h ficticias si dejó de reportar).
- Los umbrales se envían en orden (30 min → 1 h → 2 h → 3 h…), no se salta al mayor.
- Un umbral se envía **una vez por incidente**; no se repite el 5 h salvo que haya un incidente nuevo.
- Al cerrar un incidente se guarda registro `episodio_cerrado` en `incidentes.json`.

## Ejemplo
| Periodo | Acción |
|---------|--------|
| 03:12–06:04 fuera | Envía 2 h (~3 h transcurridas) |
| 06:04–11:11 en rango | Cierra incidente, contador = 0 |
| 11:11–16:30 fuera | Envía 2 h, 3 h, 4 h y 5 h según se alcancen |
