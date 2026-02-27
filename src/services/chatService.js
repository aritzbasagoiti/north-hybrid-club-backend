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

PRESENTACIÓN:
- No te presentes en cada mensaje.
- Preséntate solo en la primera interacción o si el usuario saluda.
- Si te presentas, puedes usar: "Hola! Soy Norte y estoy aquí para acompañarte en tus dudas y progresos!"

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

function detectPRQuery(message) {
  const m = (message || '').toLowerCase().trim();
  const isPR =
    /\b(pr|récord|record|marca|máximo|maximo)\b/.test(m) ||
    /\bcu[aá]nto\b/.test(m) ||
    /\bcuanto\b/.test(m);

  if (!isPR) return null;

  const exercisePatterns = [];
  let label = null;

  if (m.includes('back squat') || m.includes('sentadilla')) {
    label = 'back squat / sentadilla';
    exercisePatterns.push('%back squat%', '%sentadilla%');
  } else if (m.includes('front squat') || m.includes('sentadilla frontal')) {
    label = 'front squat / sentadilla frontal';
    exercisePatterns.push('%front squat%', '%sentadilla frontal%');
  } else if (m.includes('deadlift') || m.includes('peso muerto')) {
    label = 'deadlift / peso muerto';
    exercisePatterns.push('%deadlift%', '%peso muerto%');
  } else if (m.includes('bench') || m.includes('press banca') || m.includes('press de banca')) {
    label = 'press banca';
    exercisePatterns.push('%press banca%', '%press de banca%', '%bench%');
  }

  if (!label) return null;
  return { label, exercisePatterns };
}

function detectWhatDoYouKnowQuery(message) {
  const m = (message || '').toLowerCase();
  return (
    m.includes('que sabes de mi') ||
    m.includes('qué sabes de mí') ||
    m.includes('que recuerdas de mi') ||
    m.includes('qué recuerdas de mí') ||
    m.includes('que tienes guardado') ||
    m.includes('qué tienes guardado')
  );
}

function detectRecallDataQuery(message) {
  const m = (message || '').toLowerCase();
  return (
    m.includes('te puse') ||
    m.includes('te he puesto') ||
    m.includes('te pasé') ||
    m.includes('te pase') ||
    m.includes('te dije') ||
    m.includes('te comenté') ||
    m.includes('te comente') ||
    m.includes('lo tienes') ||
    m.includes('lo tienes?') ||
    m.includes('lo guardaste') ||
    m.includes('lo has guardado') ||
    m.includes('tienes eso') ||
    m.includes('tienes ese dato') ||
    m.includes('lo recuerdas') ||
    m.includes('recuerdas eso')
  );
}

function isGreeting(message) {
  const m = (message || '').toLowerCase().trim();
  return (
    m === 'hola' ||
    m.startsWith('hola ') ||
    m.includes('buenas') ||
    m.includes('hey') ||
    m.includes('qué tal') ||
    m.includes('que tal')
  );
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

async function getBestWeightForExercise(userId, exercisePatterns) {
  const orFilter = exercisePatterns.map((p) => `exercise.ilike.${p}`).join(',');
  const { data, error } = await supabase
    .from('training_logs')
    .select('exercise, weight, reps, sets, created_at')
    .eq('user_id', userId)
    .not('weight', 'is', null)
    .or(orFilter)
    .order('weight', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) || null;
}

async function hasAnyTrainingLogs(userId) {
  const { data, error } = await supabase
    .from('training_logs')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) || null;
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

async function saveConversationTurn(userId, userMessage, assistantMessage) {
  await saveMessage(userId, 'user', userMessage);
  await saveMessage(userId, 'assistant', assistantMessage);
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

  // Respuestas directas para preguntas de memoria/datos (evita alucinaciones)
  if (detectWhatDoYouKnowQuery(normalizedMessage)) {
    const known = [];
    if (profile?.name) known.push(`- nombre: ${profile.name}`);
    if (profile?.goal) known.push(`- objetivo: ${profile.goal}`);
    if (profile?.level) known.push(`- nivel: ${profile.level}`);
    if (profile?.injuries) known.push(`- lesiones/limitaciones: ${profile.injuries}`);
    if (profile?.availability) known.push(`- disponibilidad: ${profile.availability}`);
    if (profile?.preferences) known.push(`- preferencias: ${profile.preferences}`);

    const reply = known.length
      ? `Esto es lo que tengo guardado de ti ahora mismo:\n${known.join('\n')}`
      : `Ahora mismo no tengo datos personales guardados tuyos (nombre/objetivo/lesiones/etc.).\nDime por ejemplo: "Me llamo ___, mi objetivo es ___ y tengo ___" y lo guardaré.`;

    await saveConversationTurn(user.id, message, reply);
    return reply;
  }

  if (detectRecallDataQuery(normalizedMessage)) {
    try {
      const lastLog = await hasAnyTrainingLogs(user.id);
      const known = [];
      if (profile?.name) known.push(`- nombre: ${profile.name}`);
      if (profile?.goal) known.push(`- objetivo: ${profile.goal}`);
      if (profile?.level) known.push(`- nivel: ${profile.level}`);
      if (profile?.injuries) known.push(`- lesiones/limitaciones: ${profile.injuries}`);
      if (profile?.availability) known.push(`- disponibilidad: ${profile.availability}`);
      if (profile?.preferences) known.push(`- preferencias: ${profile.preferences}`);

      const pieces = [];
      if (known.length) pieces.push(`Sí. En tu perfil tengo:\n${known.join('\n')}`);
      if (lastLog?.created_at) {
        const date = new Date(lastLog.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        pieces.push(`Y tengo entrenamientos guardados (el último registrado es del ${date}).`);
      }

      const reply = pieces.length
        ? pieces.join('\n\n') + `\n\nSi me dices qué dato exacto buscas (por ejemplo: "mi última carrera" o "mi sentadilla"), te lo saco.`
        : `Creo que todavía no tengo datos guardados tuyos (ni perfil ni entrenamientos).\nPásame el dato otra vez (por ejemplo: "Back squat 3x5 con 100kg" o "me llamo ___ y mi objetivo es ___") y lo guardo para próximas veces.`;

      await saveConversationTurn(user.id, message, reply);
      return reply;
    } catch {
      const reply = `Ahora mismo no puedo comprobar tus datos guardados. Inténtalo de nuevo en un minuto.`;
      await saveConversationTurn(user.id, message, reply);
      return reply;
    }
  }

  const prQuery = detectPRQuery(normalizedMessage);
  if (prQuery) {
    try {
      const best = await getBestWeightForExercise(user.id, prQuery.exercisePatterns);
      const reply = best?.weight
        ? `Tu mejor registro que tengo para ${prQuery.label} es ${best.weight}kg.`
        : `No tengo ningún registro de ${prQuery.label} todavía.\nSi me escribes tu última marca (ej: "Back squat 3x5 con 100kg"), la guardo y desde ahí lo vamos siguiendo.`;

      await saveConversationTurn(user.id, message, reply);
      return reply;
    } catch {
      const reply = `Ahora mismo no puedo consultar tus registros. Inténtalo de nuevo en un minuto.`;
      await saveConversationTurn(user.id, message, reply);
      return reply;
    }
  }

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

  // Presentación solo si es primera interacción o saludo
  const shouldIntro = history.length === 0 || isGreeting(normalizedMessage);
  const intro = 'Hola! Soy Norte y estoy aquí para acompañarte en tus dudas y progresos!\n\n';
  const finalReply =
    shouldIntro && reply && !reply.toLowerCase().includes('soy norte')
      ? intro + reply
      : reply;

  await saveConversationTurn(user.id, message, finalReply);

  return finalReply;
}

module.exports = { chat, clearHistory };