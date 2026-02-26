-- NORTH Hybrid Club - Schema para Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase

-- Tabla users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla training_logs
CREATE TABLE IF NOT EXISTS training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT,
  exercise TEXT,
  sets INT,
  reps INT,
  weight FLOAT,
  time_seconds INT,
  distance_km FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla progress_snapshots
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla chat_messages (memoria persistente para la IA)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_training_logs_user_created 
  ON training_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_user 
  ON progress_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created 
  ON chat_messages(user_id, created_at);

-- RLS (Row Level Security) - opcional: habilita si necesitas políticas
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;
