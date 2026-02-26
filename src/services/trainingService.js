const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');
const { extractTrainingMetrics } = require('./gptExtractor');

/**
 * Guarda un entrenamiento desde mensaje de Telegram
 * @param {string} telegramId
 * @param {string} message
 * @returns {Promise<{saved: Array, metrics: Array}>}
 */
async function saveTraining(telegramId, message) {
  const user = await getOrCreateUser(telegramId);
  const metrics = await extractTrainingMetrics(message);

  const logs = metrics.map((m) => ({
    user_id: user.id,
    raw_text: message,
    exercise: m.exercise,
    sets: m.sets,
    reps: m.reps,
    weight: m.weight,
    time_seconds: m.time_seconds,
    distance_km: m.distance_km
  }));

  const { data, error } = await supabase
    .from('training_logs')
    .insert(logs)
    .select();

  if (error) throw error;

  return {
    saved: data,
    metrics
  };
}

/**
 * Obtiene entrenamientos del usuario en un rango de fechas
 */
async function getTrainingLogs(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('training_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Guarda snapshot de progreso
 */
async function saveProgressSnapshot(userId, periodStart, periodEnd, summary) {
  const { data, error } = await supabase
    .from('progress_snapshots')
    .insert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      summary
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  saveTraining,
  getTrainingLogs,
  saveProgressSnapshot
};
