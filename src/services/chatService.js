const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `Eres un asistente amigable del NORTH Hybrid Club, un gimnasio híbrido en Leioa (Bizkaia) especializado en HYROX, fuerza y entrenamiento funcional.
Puedes hablar de entrenamiento, nutrición, motivación, técnicas de ejercicio y cualquier tema relacionado con fitness.
Sé cercano, útil y responde en español. Si el usuario comparte un entrenamiento, puedes reconocerlo y animarle.
Mantén las respuestas concisas pero completas.`;

const conversations = new Map();

function getOrCreateHistory(telegramId) {
  if (!conversations.has(telegramId)) {
    conversations.set(telegramId, [
      { role: 'system', content: systemPrompt }
    ]);
  }
  return conversations.get(telegramId);
}

function clearHistory(telegramId) {
  conversations.delete(telegramId);
}

async function chat(telegramId, message) {
  const history = getOrCreateHistory(telegramId);
  history.push({ role: 'user', content: message });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: history,
    max_tokens: 800,
    temperature: 0.7
  });

  const reply = completion.choices[0]?.message?.content || 'No pude generar una respuesta.';
  history.push({ role: 'assistant', content: reply });

  if (history.length > 20) {
    const kept = [history[0], ...history.slice(-18)];
    conversations.set(telegramId, kept);
  }

  return reply;
}

module.exports = { chat, clearHistory };
