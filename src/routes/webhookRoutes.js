const express = require('express');
const { chat } = require('../services/chatService');
const { getWeeklyReport, getMonthlyReport } = require('../services/reportService');

const router = express.Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}

async function sendTyping(chatId) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' })
  });
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const telegramId = String(msg.from?.id || '');

  if (!text) return;

  if (text === '/start') {
    await sendTelegram(chatId, 'Hola, soy el asistente de NORTH Hybrid Club. ¿En qué puedo ayudarte?');
    return;
  }

  if (text === '/semana') {
    await sendTyping(chatId);
    try {
      const result = await getWeeklyReport(telegramId);
      await sendTelegram(chatId, result.summary || 'Sin datos para la semana.');
    } catch (err) {
      await sendTelegram(chatId, `❌ Error: ${err.message}`);
    }
    return;
  }

  if (text === '/mes') {
    await sendTyping(chatId);
    try {
      const result = await getMonthlyReport(telegramId);
      await sendTelegram(chatId, result.summary || 'Sin datos para el mes.');
    } catch (err) {
      await sendTelegram(chatId, `❌ Error: ${err.message}`);
    }
    return;
  }

  if (text.startsWith('/')) return;

  await sendTyping(chatId);
  try {
    const reply = await chat(telegramId, text);
    await sendTelegram(chatId, reply || 'No pude generar una respuesta.');
  } catch (err) {
    await sendTelegram(chatId, `❌ Error: ${err.message}`);
  }
}

router.post('/webhook/telegram', async (req, res) => {
  res.status(200).send('OK');
  try {
    await handleUpdate(req.body);
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

router.get('/webhook/telegram/setup', async (req, res) => {
  const baseUrl = req.query.url || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!BOT_TOKEN) {
    return res.status(400).json({
      error: 'Falta TELEGRAM_BOT_TOKEN en las variables de entorno'
    });
  }
  if (!baseUrl) {
    return res.status(400).json({
      error: 'Pasa la URL en la query: /webhook/telegram/setup?url=https://tu-app.vercel.app'
    });
  }
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/webhook/telegram`;
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
  const data = await tgRes.json();
  res.json({ ok: data.ok, webhook_url: webhookUrl, result: data.description || data.result });
});

module.exports = router;
