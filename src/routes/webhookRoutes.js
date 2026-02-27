const express = require('express');
const { chat } = require('../services/chatService');
const { transcribeAudioBuffer } = require('../services/transcriptionService');
const { markTelegramUpdateProcessed } = require('../services/telegramDedupService');
const { logError, logWarn, logInfo, safeErrorMessage } = require('../services/logger');

const router = express.Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const MAX_AUDIO_BYTES = Number(process.env.TELEGRAM_MAX_AUDIO_BYTES || 20 * 1024 * 1024); // 20MB por defecto

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}

async function getTelegramFilePath(fileId) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId })
  });
  if (!res.ok) throw new Error(`Telegram getFile HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) throw new Error(`Telegram getFile error: ${data.description || 'unknown'}`);
  const filePath = data?.result?.file_path;
  if (!filePath) throw new Error('No se pudo obtener file_path de Telegram');
  return filePath;
}

async function downloadTelegramFileBuffer(filePath) {
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const res = await fetchWithRetry(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Telegram file download HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (!buf.length) throw new Error('Audio vacío (0 bytes)');
  return buf;
}

async function sendTyping(chatId) {
  if (!BOT_TOKEN) return;
  try {
    await fetchWithRetry(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  } catch {
    // Ignorar fallos de typing - no es crítico
  }
}

async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  let text = (msg.text || '').trim();
  const telegramId = String(msg.from?.id || '');
  const updateId = update.update_id ?? null;
  const messageId = msg.message_id ?? null;

  // Idempotencia: si ya hemos procesado el update, salimos.
  try {
    const shouldProcess = await markTelegramUpdateProcessed({
      updateId,
      telegramUserId: telegramId,
      chatId,
      messageId
    });
    if (!shouldProcess) return;
  } catch (err) {
    logWarn('telegram dedup failed; continuing', { updateId, error: safeErrorMessage(err) });
  }

  // Si no hay texto, intentamos transcribir voz (voice / audio / video_note)
  if (!text) {
    const isVoice = Boolean(msg.voice?.file_id || msg.video_note?.file_id);
    const voiceFileId = msg.voice?.file_id || msg.audio?.file_id || msg.video_note?.file_id || null;
    if (!voiceFileId) return;

    const audioSize =
      Number(msg.voice?.file_size || msg.audio?.file_size || msg.video_note?.file_size || 0) || 0;
    if (audioSize && audioSize > MAX_AUDIO_BYTES) {
      await sendTelegram(chatId, 'Ese audio es demasiado largo/pesado para transcribirlo. Envíamelo más corto (por ejemplo 30–60s) o escríbelo.');
      return;
    }

    await sendTyping(chatId);
    try {
      const filePath = await getTelegramFilePath(voiceFileId);
      const buf = await downloadTelegramFileBuffer(filePath);
      if (buf.length > MAX_AUDIO_BYTES) {
        await sendTelegram(chatId, 'Ese audio es demasiado pesado para transcribirlo. Envíamelo más corto o escríbelo.');
        return;
      }
      const extRaw = (filePath.split('.').pop() || 'ogg').toLowerCase();
      // Telegram voice suele venir como .oga (OGG/OPUS). Forzamos .ogg para que el modelo lo acepte.
      const ext = (extRaw === 'oga' || extRaw === 'opus') ? 'ogg' : extRaw;
      const filename = isVoice ? 'telegram.ogg' : `telegram.${ext}`;
      const mime = (isVoice || ext === 'ogg') ? 'audio/ogg' : undefined;
      const transcript = await transcribeAudioBuffer(buf, filename, mime);
      text = (transcript || '').trim();

      if (!text) {
        await sendTelegram(chatId, 'No he podido transcribir ese audio. ¿Puedes repetirlo o escribirlo?');
        return;
      }
    } catch (err) {
      logWarn('audio transcription failed', { updateId, messageId, error: safeErrorMessage(err) });
      await sendTelegram(chatId, `❌ No pude transcribir el audio: ${err.message}`);
      return;
    }
  }

  // Sin comandos: todo se trata como conversación normal.
  // /start (y similares) lo convertimos a un saludo para una UX mejor.
  if (text === '/start') text = 'hola';
  if (text.startsWith('/')) text = text.slice(1).trim();

  await sendTyping(chatId);
  try {
    const reply = await chat(telegramId, text);
    await sendTelegram(chatId, reply || 'No pude generar una respuesta.');
  } catch (err) {
    logError('chat failed', { updateId, messageId, error: safeErrorMessage(err) });
    await sendTelegram(chatId, `❌ Error: ${err.message}`);
  }
}

router.post('/webhook/telegram', async (req, res) => {
  // Protección: secret token (Telegram enviará la cabecera si lo configuras en setWebhook)
  if (WEBHOOK_SECRET) {
    const incoming = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (!incoming || incoming !== WEBHOOK_SECRET) {
      res.sendStatus(401);
      return;
    }
  }

  res.sendStatus(200); // Responde inmediato a Telegram

  try {
    await handleUpdate(req.body);
  } catch (err) {
    logError('webhook error', { error: safeErrorMessage(err) });
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

  // Recomendado: setWebhook via POST para poder pasar secret_token
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET || undefined
    })
  });
  const data = await tgRes.json().catch(() => ({}));
  if (data && data.ok === false) {
    return res.status(400).json({ ok: false, webhook_url: webhookUrl, error: data.description || 'setWebhook failed' });
  }

  logInfo('telegram webhook set', { webhookUrl, hasSecret: Boolean(WEBHOOK_SECRET) });
  res.json({ ok: true, webhook_url: webhookUrl, result: data.description || data.result });
});

module.exports = router;
