const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres un asistente amigable del NORTH Hybrid Club, un gimnasio híbrido en Leioa (Bizkaia) especializado en HYROX, fuerza y entrenamiento funcional.
Puedes hablar de entrenamiento, nutrición, motivación, técnicas de ejercicio y cualquier tema relacionado con fitness.
Sé cercano, útil y responde en español. Recuerda lo que el usuario te cuenta (nombre, objetivos, preferencias) y úsalo en conversaciones futuras.
Mantén las respuestas concisas pero completas.`;

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
