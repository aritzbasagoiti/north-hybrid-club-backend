-- Ejecutar en Supabase SQL Editor para habilitar idempotencia del webhook
-- (evita que Telegram reprocese el mismo update dos veces).

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id BIGINT PRIMARY KEY,
  telegram_user_id TEXT,
  chat_id TEXT,
  message_id BIGINT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

