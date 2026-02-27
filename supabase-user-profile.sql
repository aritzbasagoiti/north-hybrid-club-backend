-- Ejecutar en Supabase SQL Editor para añadir memoria de perfil del usuario
-- (si ya tenías el schema anterior creado)

CREATE TABLE IF NOT EXISTS user_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

