-- Esquema análisis mensual de telemetría (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS analisis_mensual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei TEXT NOT NULL,
  codigo TEXT NOT NULL,
  row_key TEXT NOT NULL,
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  zona_horaria TEXT NOT NULL DEFAULT 'GMT-5',
  rango_config_snapshot JSONB,
  analizado_desde TIMESTAMPTZ,
  analizado_hasta TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'parcial'
    CHECK (estado IN ('parcial', 'cerrado_mes')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (imei, codigo, anio, mes)
);

CREATE TABLE IF NOT EXISTS analisis_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id UUID NOT NULL REFERENCES analisis_mensual(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('apagado', 'fuera_rango', 'sin_transmision')),
  since_at TIMESTAMPTZ NOT NULL,
  until_at TIMESTAMPTZ,
  duration_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  clasificacion TEXT NOT NULL DEFAULT 'sin_clasificar'
    CHECK (clasificacion IN (
      'autorizado', 'programado', 'no_previsto', 'sin_clasificar', 'defrost',
      'falso_apagado', 'falso_fuera'
    )),
  detalle TEXT,
  hash_intervalo TEXT NOT NULL,
  clasificado_por TEXT,
  clasificado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analisis_id, hash_intervalo)
);

CREATE INDEX IF NOT EXISTS idx_analisis_evento_analisis
  ON analisis_evento (analisis_id, tipo);

CREATE TABLE IF NOT EXISTS analisis_semana (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id UUID NOT NULL REFERENCES analisis_mensual(id) ON DELETE CASCADE,
  semana_index INT NOT NULL,
  desde_at TIMESTAMPTZ NOT NULL,
  hasta_at TIMESTAMPTZ NOT NULL,
  horas_fuera_rango DOUBLE PRECISION NOT NULL DEFAULT 0,
  horas_apagado DOUBLE PRECISION NOT NULL DEFAULT 0,
  horas_sin_transmision DOUBLE PRECISION NOT NULL DEFAULT 0,
  horas_defrost DOUBLE PRECISION NOT NULL DEFAULT 0,
  eventos_defrost INT NOT NULL DEFAULT 0,
  UNIQUE (analisis_id, semana_index)
);

CREATE TABLE IF NOT EXISTS analisis_punto_interpolado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id UUID NOT NULL REFERENCES analisis_mensual(id) ON DELETE CASCADE,
  evento_id UUID REFERENCES analisis_evento(id) ON DELETE SET NULL,
  ts TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  metodo TEXT NOT NULL DEFAULT 'pli_locf_horaria',
  ancla_antes_ts TIMESTAMPTZ,
  ancla_despues_ts TIMESTAMPTZ,
  creado_por TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analisis_id, ts)
);

CREATE INDEX IF NOT EXISTS idx_analisis_punto_ts
  ON analisis_punto_interpolado (analisis_id, ts);
