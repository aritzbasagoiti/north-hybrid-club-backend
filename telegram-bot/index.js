require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiUrl = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

async function callApi(path, options = {}) {
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Hola, soy el asistente de NORTH Hybrid Club. ¿En qué puedo ayudarte?`
  );
});

bot.onText(/\/semana/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    await bot.sendMessage(chatId, '⏳ Generando informe semanal...');
    const data = await callApi(`/weekly-report/${telegramId}`);
    await bot.sendMessage(chatId, data.summary || 'Sin datos para la semana.');
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/mes/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);

  try {
    await bot.sendMessage(chatId, '⏳ Generando informe mensual...');
    const data = await callApi(`/monthly-report/${telegramId}`);
    await bot.sendMessage(chatId, data.summary || 'Sin datos para el mes.');
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() || '';

  if (!text || text.startsWith('/')) return;

  const telegramId = String(msg.from.id);

  try {
    await bot.sendChatAction(chatId, 'typing');
    const data = await callApi('/chat', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: telegramId, message: text })
    });

    if (data.status === 'ok') {
      await bot.sendMessage(chatId, data.reply || 'No pude generar una respuesta.');
    }
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

console.log('🤖 Bot de NORTH Hybrid Club activo');
console.log(`📡 API: ${apiUrl}`);
