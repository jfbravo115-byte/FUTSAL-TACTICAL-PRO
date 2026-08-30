-- Migración inicial: tabla partidos para Futsal Commander Pro.
-- Aplica automáticamente en cada deploy (producción y deploy previews).
-- Creada con la integración nativa Netlify Database (@netlify/database).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS partidos (
  -- UUID autogenerado en Postgres. Sustituye al document id de Firestore.
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Firebase Auth UID del propietario.
  -- En Firestore este filtrado lo hacían las reglas de seguridad;
  -- aquí lo gestionamos explícitamente.
  user_uid   TEXT NOT NULL,

  -- El partido completo (MatchData) serializado como JSONB.
  -- Se almacena sin columnas separadas para facilitar el esquema evolutivo.
  data       JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para la consulta principal: lista de partidos de un usuario, orden desc.
CREATE INDEX IF NOT EXISTS idx_partidos_user_uid_created
  ON partidos (user_uid, created_at DESC);

COMMENT ON TABLE partidos IS
  'Historial de partidos de Futsal Commander Pro. Migrado desde Firestore.';
COMMENT ON COLUMN partidos.user_uid IS
  'Firebase Auth UID. Equivale al filtrado por reglas de Firestore.';
COMMENT ON COLUMN partidos.data IS
  'Objeto MatchData completo. Ver src/types/futsal.ts.';
