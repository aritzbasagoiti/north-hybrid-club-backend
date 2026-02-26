const { supabase } = require('../config/supabase');

/**
 * Obtiene o crea un usuario por telegram_id
 * @param {string} telegramId - ID de Telegram del usuario
 * @param {string} name - Nombre opcional
 * @returns {Promise<{id: string}>}
 */
async function getOrCreateUser(telegramId, name = null) {
  if (!telegramId || typeof telegramId !== 'string') {
    throw new Error('telegram_id es requerido');
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', String(telegramId))
    .single();

  if (existing) {
    if (name) {
      await supabase
        .from('users')
        .update({ name })
        .eq('id', existing.id);
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      telegram_id: String(telegramId),
      name: name || `Usuario ${telegramId}`
    })
    .select('id')
    .single();

  if (error) throw error;
  return created;
}

module.exports = { getOrCreateUser };
