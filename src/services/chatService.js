const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');
const { getTrainingLogs } = require('./trainingService');
const { extractTrainingMetrics } = require('./gptExtractor');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
   SYSTEM PROMPT PRO
========================= */

const SYSTEM_PROMPT = `
IDENTIDAD:
Eres el Head Coach oficial de NORTH Hybrid Club.
Especialista en HYROX, fuerza y entrenamiento híbrido.

PERSONALIDAD:
- Cercano pero profesional.
- Directo y claro. No das respuestas vacías.
- Motivador pero natural.
- Hablas como un entrenador real.
- Máximo 2 emojis por mensaje.

REGLAS IMPORTANTES:
1. Nunca inventes datos.
2. Usa únicamente los datos del bloque DATOS_ENTRENAMIENTO cuando analices progresos.
3. Si el usuario responde "sí", "vale", "ok", continúa exactamente el tema anterior.
4. No reinicies conversación sin motivo.
5. No hagas preguntas genéricas innecesarias.
6. No contestes con textos demasiado largos. Solo cuando el usuario te lo pida.
7. No hables de cosas que no sabes.
8. Si no sabes algo, responde con: "No puedo darte una respuesta sobre eso"

FUNCIONES:
- Analizar entrenamientos.
- Detectar mejoras o estancamientos.
- Dar recomendaciones prácticas.
- Dar consejos básicos de nutrición sin sustituir médicos.

DATOS DEL CLUB:
Horario:
L-V: 7:30–20:30
S: 9:00–14:00
D: Cerrado

Filosofía:
Entrenamiento híbrido que combina fuerza, resistencia y técnica funcional orientado a rendimiento HYROX.

OBJETIVO:
Ser percibido como un entrenador real, no como una IA.
`;

const MAX_HISTORY = 30;

/* =========================
   HELPERS
========================= */

function needsTrainingContext(message) {
  const keywords = [
    'ayer',
    'semana',
    'mes',
    'progreso',
    'marca',
    'mejora',
    'corrí',
    'corriste',
    'peso',
    'tiempo',
    'km',
    'entrené'
  ];
  return keywords.some(k => message.toLowerCase().includes(k));
}

function normalizeShortReply(message, history) {
  const short = ['si', 'sí', 'vale', 'ok', 'claro'];
  if (!short.includes(message.toLowerCase().trim())) return message;

  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return message;

  return `El usuario confirma que quiere continuar con esto: "${lastAssistant.content}"`;
}

/* =========================
   LOAD HISTORY
========================= */

async function loadHistory(userId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY);

  return (data || []).map(m => ({
    role: m.role,
    content: m.content
  }));
}

/* =========================
   LOAD TRAINING CONTEXT
========================= */

async function loadTrainingContext(userId) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 60);

  const logs = await getTrainingLogs(
    userId,
    start.toISOString(),
    end.toISOString()
  );

  if (!logs || logs.length === 0) return '';

  const structured = logs.map(l => {
    const date = new Date(l.created_at).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });

    return `
Fecha: ${date}
Ejercicio: ${l.exercise || 'N/A'}
Series: ${l.sets || '-'}
Reps: ${l.reps || '-'}
Peso: ${l.weight ? l.weight + 'kg' : '-'}
Distancia: ${l.distance_km ? l.distance_km + 'km' : '-'}
Tiempo: ${l.time_seconds ? Math.round(l.time_seconds / 60) + 'min' : '-'}
`;
  });

  return `
DATOS_ENTRENAMIENTO:
${structured.join('\n')}
FIN_DATOS
`;
}

/* =========================
   SAVE TRAINING AUTO
========================= */

async function trySaveTrainingFromMessage(userId, message) {
  try {
    const metrics = await extractTrainingMetrics(message);
    if (!metrics || metrics.length === 0) return;

    const logs = metrics.map(m => ({
      user_id: userId,
      raw_text: message,
      exercise: m.exercise,
      sets: m.sets,
      reps: m.reps,
      weight: m.weight,
      time_seconds: m.time_seconds,
      distance_km: m.distance_km
    }));

    await supabase.from('training_logs').insert(logs);
  } catch (e) {
    console.log('Extractor error (ignored)');
  }
}

/* =========================
   SAVE CHAT MESSAGE
========================= */

async function saveMessage(userId, role, content) {
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role,
    content
  });
}

/* =========================
   CLEAR HISTORY
========================= */

async function clearHistory(telegramId) {
  const user = await getOrCreateUser(telegramId);
  await supabase.from('chat_messages').delete().eq('user_id', user.id);
}

/* =========================
   MAIN CHAT FUNCTION
========================= */

async function chat(telegramId, message) {
  const user = await getOrCreateUser(telegramId);

  const history = await loadHistory(user.id);
  const normalizedMessage = normalizeShortReply(message, history);

  let trainingContext = '';
  if (needsTrainingContext(normalizedMessage)) {
    trainingContext = await loadTrainingContext(user.id);
  }

  const systemContent = SYSTEM_PROMPT + '\n' + trainingContext;

  await trySaveTrainingFromMessage(user.id, normalizedMessage);

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: normalizedMessage }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.6,
    max_tokens: 600
  });

  const reply =
    completion.choices[0]?.message?.content ||
    'No pude generar respuesta.';

  await saveMessage(user.id, 'user', message);
  await saveMessage(user.id, 'assistant', reply);

  return reply;
}

module.exports = { chat, clearHistory };