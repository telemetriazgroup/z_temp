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

-- Cursor global de procesamiento incremental (samples ya consumidos).
CREATE TABLE IF NOT EXISTS senal_cursor (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_captured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO senal_cursor (id, last_captured_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- Estado abierto por dispositivo (wait/offline en curso).
CREATE TABLE IF NOT EXISTS senal_device_state (
  imei TEXT PRIMARY KEY,
  codigo TEXT,
  row_key TEXT,
  last_estado TEXT,
  last_captured_at TIMESTAMPTZ,
  open_tipo TEXT
    CHECK (open_tipo IS NULL OR open_tipo IN ('wait', 'offline')),
  open_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Episodios cerrados wait/offline → online (o cambio de tipo).
CREATE TABLE IF NOT EXISTS senal_episodio (
  id BIGSERIAL PRIMARY KEY,
  imei TEXT NOT NULL,
  codigo TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('wait', 'offline')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_min INT NOT NULL,
  recovered BOOLEAN NOT NULL DEFAULT true,
  start_hour SMALLINT,
  end_hour SMALLINT,
  anio INT NOT NULL,
  mes INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_senal_episodio_mes
  ON senal_episodio (anio, mes, imei);

CREATE INDEX IF NOT EXISTS idx_senal_episodio_imei_time
  ON senal_episodio (imei, started_at DESC);

-- Resumen materializado por dispositivo y mes (no se recalcula desde cero).
CREATE TABLE IF NOT EXISTS senal_resumen_mes (
  imei TEXT NOT NULL,
  anio INT NOT NULL,
  mes INT NOT NULL,
  codigo TEXT,
  wait_episodes INT NOT NULL DEFAULT 0,
  wait_recovered INT NOT NULL DEFAULT 0,
  wait_total_min INT NOT NULL DEFAULT 0,
  offline_episodes INT NOT NULL DEFAULT 0,
  offline_recovered INT NOT NULL DEFAULT 0,
  offline_total_min INT NOT NULL DEFAULT 0,
  hourly_wait_min JSONB NOT NULL DEFAULT
    '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
  hourly_offline_min JSONB NOT NULL DEFAULT
    '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
  samples_seen INT NOT NULL DEFAULT 0,
  last_estado TEXT,
  last_captured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (imei, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_senal_resumen_mes_periodo
  ON senal_resumen_mes (anio, mes);

-- Meta del mes: procesado una vez / cerrado (no reescanea samples históricos).
CREATE TABLE IF NOT EXISTS senal_mes_meta (
  anio INT NOT NULL,
  mes INT NOT NULL,
  processed_once BOOLEAN NOT NULL DEFAULT false,
  finalized BOOLEAN NOT NULL DEFAULT false,
  sample_count INT NOT NULL DEFAULT 0,
  device_count INT NOT NULL DEFAULT 0,
  first_processed_at TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  PRIMARY KEY (anio, mes)
);
