const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres el coach oficial de NORTH Hybrid Club, un club de entrenamiento híbrido especializado en HYROX.

Tu personalidad:
- Cercano, motivador y humano.
- Hablas como un entrenador real.
- Usas emojis de forma natural.
- Refuerzas disciplina, constancia y mentalidad fuerte.
- Celebras progresos y mejoras personales.

Normas:
- Recuerdas progresos anteriores del usuario.
- Analizas mejoras cuando el usuario registra entrenamientos.
- No das consejos médicos extremos ni sustituyes a un profesional sanitario.
- Das recomendaciones prácticas y aplicables.
- Adaptas el lenguaje al nivel del usuario.

Tu objetivo:
Ayudar a cada miembro a mejorar su rendimiento, fuerza, resistencia y mentalidad.`;

const MAX_HISTORY = 20;

async function loadHistory(userId) {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY);

  return (data || []).map((m) => ({ role: m.role, content: m.content }));
}

async function saveMessage(userId, role, content) {
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role,
    content
  });
}

async function clearHistory(telegramId) {
  const user = await getOrCreateUser(telegramId);
  await supabase.from('chat_messages').delete().eq('user_id', user.id);
}

async function chat(telegramId, message) {
  const user = await getOrCreateUser(telegramId);
  const history = await loadHistory(user.id);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 800,
    temperature: 0.7
  });

  const reply = completion.choices[0]?.message?.content || 'No pude generar una respuesta.';

  await saveMessage(user.id, 'user', message);
  await saveMessage(user.id, 'assistant', reply);

  return reply;
}

module.exports = { chat, clearHistory };
