-- Snapshots de flota para resúmenes e históricos del dashboard (Inicio).

CREATE TABLE IF NOT EXISTS dashboard_fleet_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total INT NOT NULL DEFAULT 0,
  online INT NOT NULL DEFAULT 0,
  wait INT NOT NULL DEFAULT 0,
  offline INT NOT NULL DEFAULT 0,
  power_on INT NOT NULL DEFAULT 0,
  power_off INT NOT NULL DEFAULT 0,
  en_defrost INT NOT NULL DEFAULT 0,
  en_rango INT NOT NULL DEFAULT 0,
  fuera_rango INT NOT NULL DEFAULT 0,
  apagado INT NOT NULL DEFAULT 0,
  indeterminado INT NOT NULL DEFAULT 0,
  pct_online DOUBLE PRECISION,
  pct_en_rango DOUBLE PRECISION,
  by_codigo JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dashboard_fleet_captured
  ON dashboard_fleet_snapshot (captured_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_device_sample (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES dashboard_fleet_snapshot(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  imei TEXT NOT NULL,
  codigo TEXT,
  row_key TEXT NOT NULL,
  estado_conexion TEXT NOT NULL
    CHECK (estado_conexion IN ('online', 'wait', 'offline')),
  power_state TEXT
    CHECK (power_state IS NULL OR power_state IN ('on', 'off')),
  rango_estado TEXT NOT NULL
    CHECK (rango_estado IN ('normal', 'fuera', 'apagado', 'indeterminado')),
  en_defrost BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_dashboard_device_captured
  ON dashboard_device_sample (captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_device_imei_time
  ON dashboard_device_sample (imei, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_device_snapshot
  ON dashboard_device_sample (snapshot_id);

-- Última lectura operativa (set, suministro, retorno, USDA, power) por muestra.
ALTER TABLE dashboard_device_sample
  ADD COLUMN IF NOT EXISTS telemetry JSONB;

-- Equipos conocidos: primera aparición + cola de revisión rápida.
CREATE TABLE IF NOT EXISTS dashboard_known_device (
  row_key TEXT PRIMARY KEY,
  imei TEXT NOT NULL,
  codigo TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_estado_conexion TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente', 'revisado', 'ignorado')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  last_estado_conexion TEXT,
  last_power_state TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dashboard_known_first_seen
  ON dashboard_known_device (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_known_review
  ON dashboard_known_device (review_status, first_seen_at DESC);

-- Último estatus por link API + muestra exitosa (fuera de la API en vivo).
CREATE TABLE IF NOT EXISTS dashboard_link_status (
  codigo TEXT PRIMARY KEY,
  url TEXT,
  ok BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms INT,
  error_message TEXT,
  device_count INT NOT NULL DEFAULT 0,
  online_count INT NOT NULL DEFAULT 0,
  wait_count INT NOT NULL DEFAULT 0,
  offline_count INT NOT NULL DEFAULT 0,
  last_ok_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_success JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Trazabilidad de sondas de links (retención ~3 h).
CREATE TABLE IF NOT EXISTS dashboard_link_probe (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL,
  latency_ms INT,
  error_message TEXT,
  device_count INT NOT NULL DEFAULT 0,
  online_count INT NOT NULL DEFAULT 0,
  wait_count INT NOT NULL DEFAULT 0,
  offline_count INT NOT NULL DEFAULT 0,
  sample JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dashboard_link_probe_time
  ON dashboard_link_probe (checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_link_probe_codigo_time
  ON dashboard_link_probe (codigo, checked_at DESC);

-- Logins / usuarios conectados recientes.
CREATE TABLE IF NOT EXISTS dashboard_user_login (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  username TEXT NOT NULL,
  role TEXT,
  super_user BOOLEAN NOT NULL DEFAULT false,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_login_time
  ON dashboard_user_login (logged_in_at DESC);
