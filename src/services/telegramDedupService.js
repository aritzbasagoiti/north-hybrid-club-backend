const { supabase } = require('../config/supabase');

/**
 * Inserta el update_id en BD. Si ya existe, devuelve false (ya procesado).
 * @returns {Promise<boolean>}
 */
async function markTelegramUpdateProcessed({ updateId, telegramUserId, chatId, messageId }) {
  if (updateId === null || updateId === undefined) return true; // si no hay update_id, no bloqueamos

  const row = {
    update_id: Number(updateId),
    telegram_user_id: telegramUserId ? String(telegramUserId) : null,
    chat_id: chatId ? String(chatId) : null,
    message_id: messageId === null || messageId === undefined ? null : Number(messageId)
  };

  // upsert con PK update_id: si ya existe, no re-procesamos
  const { error } = await supabase
    .from('telegram_updates')
    .insert(row);

  if (!error) return true;

  // Postgres unique violation -> ya existe
  const code = error.code || error?.details || '';
  const msg = (error.message || '').toLowerCase();
  const isDuplicate = error.code === '23505' || msg.includes('duplicate key') || msg.includes('unique');
  if (isDuplicate) return false;

  // Si falla por "tabla no existe", mejor no romper el bot: dejamos pasar.
  const isMissingTable = msg.includes('relation') && msg.includes('does not exist');
  if (isMissingTable) return true;

  throw error;
}

module.exports = { markTelegramUpdateProcessed };

