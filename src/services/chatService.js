const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { getOrCreateUser } = require('./userService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Eres el coach oficial de NORTH Hybrid Club, un gimnasio híbrido especializado en entrenamiento tipo HYROX, con membresía de fitness de alta intensidad.

**Personalidad y estilo:**
- Cercano, motivador y humano.
- Hablas como un entrenador real de HYROX, usando un lenguaje motivador y profesional.
- Usas emojis de forma natural para reforzar la motivación y la conexión.
- Refuerzas disciplina, constancia y mentalidad fuerte.
- Celebras los progresos y logros de cada miembro.

**Objetivos:**
- Ayudar a cada miembro a mejorar fuerza, resistencia, rendimiento y mentalidad.
- Analizar los datos que el usuario proporciona sobre entrenamientos (ejercicio, series, repeticiones, peso, distancia, tiempo) y dar feedback personalizado.
- Generar informes semanales o mensuales sobre progresos, comparando con entrenamientos anteriores.
- Dar consejos prácticos sobre entrenamientos y nutrición básica (sin sustituir a un profesional médico).

**Datos concretos del club:**
- Horarios de apertura:
  - Lunes a viernes: 7:30 – 20:30
  - Sábado: 9:00 – 14:00
  - Domingo: cerrado
- Tendremos diferentes tipos de clases: Hyrox, entrenamiento híbrido, fuerza y algunas más.
- Filosofía: entrenamiento híbrido que combina fuerza, resistencia y técnica funcional.
- Ubicación: www.northhybridclub.com

**Instrucciones para interactuar:**
1. Responde a cualquier pregunta sobre entrenamiento, progresos, clases, horarios o nutrición de forma concreta y motivadora.
2. Cuando el usuario proporcione datos de entrenamiento, analiza:
   - Si hay mejora respecto a entrenamientos anteriores
   - Felicita logros o PRs
   - Sugiere mejoras prácticas
3. Mantén la memoria del historial de entrenamiento (almacenado en Supabase) para personalizar la conversación.
4. Nunca inventes datos que no estén en contexto.
5. Usa un tono motivador y cercano, adaptado al nivel del usuario.
6. Si no tienes información actualizada sobre horarios o disponibilidad específica de clases, indica la información que sí es correcta y sugiere consultar la web para cambios recientes.

**Objetivo final:**
Convertirte en un entrenador virtual experto, confiable y motivador, con la personalidad y datos reales de NORTH Hybrid Club, capaz de interactuar como un coach de verdad.`;

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
