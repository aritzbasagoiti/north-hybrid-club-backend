const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');
const { getTrainingLogs } = require('./trainingService');
const { extractTrainingMetrics } = require('./gptExtractor');
const { getClubContextIfNeeded } = require('./clubInfoService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
   SYSTEM PROMPT PRO
========================= */

const SYSTEM_PROMPT = `
IDENTIDAD:
Tu nombre es NORTE.
Eres el coach oficial de NORTH Hybrid Club.
Especialista en HYROX, fuerza y entrenamiento híbrido.

SALUDO (úsalo de forma natural, sobre todo al inicio o cuando el usuario salude):
Hola! Soy Norte y estoy aqui para acompañarte en tus dudas y progresos!

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

function shouldUpdateProfile(message) {
  const m = message.toLowerCase();
  const keywords = [
    'me llamo',
    'mi nombre',
    'tengo ',
    'mido ',
    'peso ',
    'objetivo',
    'meta',
    'lesion',
    'lesión',
    'dolor',
    'oper',
    'disponibilidad',
    'horario',
    'prefiero',
    'no me gusta',
    'me gusta'
  ];
  return keywords.some((k) => m.includes(k));
}

function looksLikeTrainingLog(message) {
  const m = (message || '').toLowerCase();
  // patrones típicos: 3x8, 27:30, 5km, 90kg
  const patterns = [
    /\b\d+\s*x\s*\d+\b/,
    /\b\d+:\d{2}\b/,
    /\b\d+(\.\d+)?\s*km\b/,
    /\b\d+(\.\d+)?\s*kg\b/,
    /\bseries?\b/,
    /\breps?\b/,
    /\bmetcon\b/,
    /\brun\b/,
    /\bcorr(i|í)\b/,
    /\bremo\b/,
    /\bwall\s*balls?\b/,
    /\bsled\b/,
    /\bsentadilla\b/,
    /\bpress\b/
  ];
  return patterns.some((p) => p.test(m));
}

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
    'entrené',
    'cuanto',
    'cuánto',
    'recuerdas',
    'te dije',
    'habia dicho',
    'había dicho'
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

function formatProfileForPrompt(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const lines = [];
  const push = (k, v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string' && !v.trim()) return;
    lines.push(`- ${k}: ${typeof v === 'string' ? v.trim() : JSON.stringify(v)}`);
  };

  push('nombre', profile.name);
  push('objetivo', profile.goal);
  push('nivel', profile.level);
  push('lesiones/limitaciones', profile.injuries);
  push('disponibilidad', profile.availability);
  push('preferencias', profile.preferences);

  if (lines.length === 0) return '';
  return `PERFIL_USUARIO (memoria persistente):\n${lines.join('\n')}\nFIN_PERFIL`;
}

/* =========================
   LOAD HISTORY
========================= */

async function loadHistory(userId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);

  const items = (data || []).map(m => ({
    role: m.role,
    content: m.content
  }));
  return items.reverse();
}

/* =========================
   PROFILE MEMORY (Supabase)
========================= */

async function loadUserProfile(userId) {
  const { data } = await supabase
    .from('user_profile')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.profile || {};
}

async function upsertUserProfile(userId, profile) {
  await supabase
    .from('user_profile')
    .upsert({ user_id: userId, profile, updated_at: new Date().toISOString() });
}

async function updateProfileFromMessage({ userId, message, existingProfile }) {
  const extractorSystem = `Eres un extractor de datos de perfil de un usuario para un coach de entrenamiento.\nDevuelve SOLO JSON válido.\n\nExtrae y actualiza estos campos si aparecen:\n- name (string)\n- goal (string)\n- level (string) (principiante/intermedio/avanzado)\n- injuries (string)\n- availability (string)\n- preferences (string)\n\nReglas:\n- Si no hay datos nuevos, devuelve {}.\n- No inventes datos.\n- Si el usuario no da un dato explícito, no lo pongas.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: extractorSystem },
      { role: 'user', content: JSON.stringify({ existingProfile, message }) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  });

  const content = completion.choices[0]?.message?.content || '{}';
  let extracted = {};
  try {
    extracted = JSON.parse(content);
  } catch {
    extracted = {};
  }

  if (!extracted || typeof extracted !== 'object') return existingProfile;

  const merged = { ...existingProfile };
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    merged[k] = v;
  }

  return merged;
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
    if (!looksLikeTrainingLog(message)) return;
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

  const profile = await loadUserProfile(user.id);
  const profileBlock = formatProfileForPrompt(profile);

  const clubContext = await getClubContextIfNeeded(normalizedMessage);

  let trainingContext = '';
  if (needsTrainingContext(normalizedMessage)) {
    trainingContext = await loadTrainingContext(user.id);
  }

  const systemContent = [
    SYSTEM_PROMPT,
    clubContext,
    profileBlock,
    trainingContext
  ].filter(Boolean).join('\n\n');

  await trySaveTrainingFromMessage(user.id, normalizedMessage);

  if (shouldUpdateProfile(normalizedMessage)) {
    updateProfileFromMessage({
      userId: user.id,
      message: normalizedMessage,
      existingProfile: profile
    })
      .then((merged) => upsertUserProfile(user.id, merged))
      .catch(() => {});
  }

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