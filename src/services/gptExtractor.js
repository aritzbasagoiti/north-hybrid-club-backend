const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente que analiza mensajes de entrenamiento físico y extrae métricas estructuradas.
Contexto: NORTH Hybrid Club - gimnasio especializado en HYROX, fuerza y condicionamiento funcional.
Ejercicios comunes: press banca, sentadilla, deadlift, sled push, wall balls, carrera, remo, burpees, thrusters, etc.

Debes identificar:
- Nombre del ejercicio (en español, normalizado)
- sets (series)
- reps (repeticiones)
- weight (peso en kg)
- time_seconds (tiempo en segundos si aplica)
- distance_km (distancia en km si aplica)

Si el mensaje contiene VARIOS ejercicios, extrae cada uno como un objeto separado en el array "exercises".
Si solo hay uno, devuelve un array con un objeto.

Responde ÚNICAMENTE con un JSON válido, sin markdown, con esta estructura:
{
  "exercises": [
    {
      "exercise": "nombre del ejercicio",
      "sets": número o null,
      "reps": número o null,
      "weight": número o null,
      "time_seconds": número o null,
      "distance_km": número o null
    }
  ]
}

Conversiones: 27:30 = 1650 segundos, 5km = 5, 100kg = 100. Usa null para campos no mencionados.`;

/**
 * Extrae métricas de entrenamiento de un mensaje de texto usando GPT
 * @param {string} message - Mensaje del usuario con el entrenamiento
 * @returns {Promise<Array>} - Array de objetos con exercise, sets, reps, weight, time_seconds, distance_km
 */
async function extractTrainingMetrics(message) {
  if (!message || typeof message !== 'string') {
    throw new Error('Mensaje inválido');
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message.trim() }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT no devolvió respuesta');
  }

  const parsed = JSON.parse(content);

  if (!parsed.exercises || !Array.isArray(parsed.exercises)) {
    throw new Error('Formato de respuesta GPT inválido');
  }

  return parsed.exercises.map((e) => ({
    exercise: e.exercise || 'entrenamiento',
    sets: typeof e.sets === 'number' ? e.sets : null,
    reps: typeof e.reps === 'number' ? e.reps : null,
    weight: typeof e.weight === 'number' ? e.weight : null,
    time_seconds: typeof e.time_seconds === 'number' ? e.time_seconds : null,
    distance_km: typeof e.distance_km === 'number' ? e.distance_km : null
  }));
}

module.exports = { extractTrainingMetrics };
