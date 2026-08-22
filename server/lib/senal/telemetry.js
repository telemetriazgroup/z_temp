function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza set, suministro, retorno, USDA1-3 y power state.
 * Acepta ultimo_dato, sample.telemetry o un snapshot ya guardado.
 */
export function normalizeTelemetry(raw, capturedAt = null) {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw.ultimo_dato && typeof raw.ultimo_dato === 'object' ? raw.ultimo_dato : raw;
  const snap = {
    capturedAt: capturedAt
      ? new Date(capturedAt).toISOString()
      : raw.capturedAt
        ? new Date(raw.capturedAt).toISOString()
        : null,
    set_point: numOrNull(u.set_point),
    temp_supply_1: numOrNull(u.temp_supply_1 ?? u.supply_air_temp),
    return_air: numOrNull(u.return_air ?? u.return_air_temp),
    cargo_1_temp: numOrNull(u.cargo_1_temp),
    cargo_2_temp: numOrNull(u.cargo_2_temp),
    cargo_3_temp: numOrNull(u.cargo_3_temp),
    power_state: u.power_state ?? raw.power_state ?? null,
    power_state_texto:
      raw.power_state_texto === 'on' || raw.power_state_texto === 'off'
        ? raw.power_state_texto
        : u.power_state_texto === 'on' || u.power_state_texto === 'off'
          ? u.power_state_texto
          : raw.power_state === 'on' || raw.power_state === 'off'
            ? raw.power_state
            : null,
  };
  const hasValue = [
    snap.set_point,
    snap.temp_supply_1,
    snap.return_air,
    snap.cargo_1_temp,
    snap.cargo_2_temp,
    snap.cargo_3_temp,
    snap.power_state,
    snap.power_state_texto,
  ].some((v) => v != null);
  return hasValue ? snap : null;
}

export function pickTelemetryFromDispositivo(d, capturedAt = null) {
  if (!d) return null;
  return normalizeTelemetry(
    {
      ...(d.ultimo_dato ?? {}),
      power_state: d.ultimo_dato?.power_state ?? d.power_state ?? null,
      power_state_texto: d.power_state_texto ?? null,
    },
    capturedAt ?? d.ultima_actualizacion ?? d.captured_at ?? null
  );
}

export function pickTelemetryFromSample(s) {
  if (!s) return null;
  if (s.telemetry && typeof s.telemetry === 'object') {
    return normalizeTelemetry(s.telemetry, s.captured_at);
  }
  return normalizeTelemetry(s, s.captured_at);
}

export function pickTelemetryFromHistorialRow(row) {
  if (!row) return null;
  const at = row.created_at ?? row.fecha ?? null;
  return normalizeTelemetry(row, at);
}
