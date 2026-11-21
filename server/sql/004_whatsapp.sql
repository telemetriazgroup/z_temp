-- Contactos de WhatsApp. No son usuarios de login de la plataforma.
CREATE TABLE IF NOT EXISTS wa_contacto (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  alertas_habilitadas BOOLEAN NOT NULL DEFAULT false,
  prueba_iniciada_en TIMESTAMPTZ,
  prueba_respuestas INT NOT NULL DEFAULT 0,
  prueba_requeridas INT NOT NULL DEFAULT 3,
  aprobado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_asignacion (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES wa_contacto(id) ON DELETE CASCADE,
  row_key TEXT NOT NULL,
  imei TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT,
  UNIQUE (contacto_id, row_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_asignacion_row ON wa_asignacion (row_key);

CREATE TABLE IF NOT EXISTS wa_mensaje (
  id BIGSERIAL PRIMARY KEY,
  contacto_id INT REFERENCES wa_contacto(id) ON DELETE SET NULL,
  telefono TEXT NOT NULL,
  direccion TEXT NOT NULL,
  texto TEXT NOT NULL,
  tipo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_mensaje_tel_time ON wa_mensaje (telefono, creado_en DESC);

ALTER TABLE wa_contacto ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE wa_contacto ADD COLUMN IF NOT EXISTS alertas_pausadas BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS wa_contacto_username_uidx ON wa_contacto (username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS wa_silencio (
  contacto_id INT NOT NULL REFERENCES wa_contacto(id) ON DELETE CASCADE,
  row_key TEXT NOT NULL,
  PRIMARY KEY (contacto_id, row_key)
);

CREATE TABLE IF NOT EXISTS wa_evento (
  id BIGSERIAL PRIMARY KEY,
  contacto_id INT REFERENCES wa_contacto(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  detalle TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
