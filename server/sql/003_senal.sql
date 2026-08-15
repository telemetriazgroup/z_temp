-- Ubicación / zona operativa por IMEI para análisis de señal (superadmin).

CREATE TABLE IF NOT EXISTS senal_ubicacion (
  imei TEXT PRIMARY KEY,
  codigo TEXT,
  pais TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  zona TEXT,
  observaciones TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_senal_ubicacion_pais
  ON senal_ubicacion (pais);

CREATE INDEX IF NOT EXISTS idx_senal_ubicacion_depto
  ON senal_ubicacion (departamento);

CREATE INDEX IF NOT EXISTS idx_senal_ubicacion_zona
  ON senal_ubicacion (zona);
