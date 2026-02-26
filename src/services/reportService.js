const { supabase } = require('../config/supabase');
const { getTrainingLogs, saveProgressSnapshot } = require('./trainingService');
const { getOrCreateUser } = require('./userService');

/**
 * Genera resumen de entrenamientos para un período
 */
function generateSummary(logs, periodLabel) {
  if (!logs || logs.length === 0) {
    return `No hay registros de entrenamiento para ${periodLabel}.`;
  }

  const exercises = {};
  let totalReps = 0;
  let totalDistance = 0;
  let totalTime = 0;
  let totalVolume = 0;

  for (const log of logs) {
    const ex = log.exercise || 'sin nombre';
    if (!exercises[ex]) exercises[ex] = { count: 0, reps: 0, weight: 0, volume: 0 };
    exercises[ex].count += 1;
    if (log.reps) {
      exercises[ex].reps += log.reps * (log.sets || 1);
      totalReps += log.reps * (log.sets || 1);
    }
    if (log.weight) {
      const vol = (log.reps || 0) * (log.sets || 1) * log.weight;
      exercises[ex].volume += vol;
      exercises[ex].weight = Math.max(exercises[ex].weight || 0, log.weight);
      totalVolume += vol;
    }
    if (log.distance_km) totalDistance += log.distance_km;
    if (log.time_seconds) totalTime += log.time_seconds;
  }

  const lines = [
    `Resumen ${periodLabel}:`,
    `- Sesiones registradas: ${logs.length}`,
    `- Repeticiones totales: ${totalReps}`,
    totalVolume > 0 ? `- Volumen total (kg): ${Math.round(totalVolume)}` : null,
    totalDistance > 0 ? `- Distancia total: ${totalDistance.toFixed(1)} km` : null,
    totalTime > 0 ? `- Tiempo total: ${Math.round(totalTime / 60)} min` : null,
    '',
    'Ejercicios más frecuentes:',
    ...Object.entries(exercises)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, d]) => `  • ${name}: ${d.count} sesiones`)
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Genera informe semanal
 */
async function getWeeklyReport(telegramId) {
  const user = await getOrCreateUser(telegramId);

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  const logs = await getTrainingLogs(user.id, start.toISOString(), now.toISOString());
  const summary = generateSummary(logs, 'últimos 7 días');

  await saveProgressSnapshot(user.id, startStr, endStr, summary);

  const metrics = {
    sessions: logs.length,
    exercises: [...new Set(logs.map((l) => l.exercise))]
  };

  return { summary, metrics };
}

/**
 * Genera informe mensual
 */
async function getMonthlyReport(telegramId) {
  const user = await getOrCreateUser(telegramId);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  const logs = await getTrainingLogs(user.id, start.toISOString(), now.toISOString());
  const summary = generateSummary(logs, 'este mes');

  await saveProgressSnapshot(user.id, startStr, endStr, summary);

  const metrics = {
    sessions: logs.length,
    exercises: [...new Set(logs.map((l) => l.exercise))]
  };

  return { summary, metrics };
}

module.exports = { getWeeklyReport, getMonthlyReport };
