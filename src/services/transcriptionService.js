const OpenAI = require('openai');
const { toFile } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudioBuffer(buffer, filename = 'audio.ogg', mimeType = undefined) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Falta OPENAI_API_KEY para transcribir audio');
  }
  const makeFile = () => toFile(buffer, filename, mimeType ? { type: mimeType } : undefined);

  // Intento 1: modelo barato
  {
    const file = await makeFile();
    const result = await openai.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file,
      language: 'es',
      temperature: 0
    });
    const text = (typeof result === 'string' ? result : result.text) || '';
    if (text.trim()) return text.trim();
  }

  // Fallback: Whisper (a veces transcribe mejor ciertos audios de Telegram)
  {
    const file = await makeFile();
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'es',
      temperature: 0
    });
    const text = (typeof result === 'string' ? result : result.text) || '';
    return text.trim();
  }
}

module.exports = { transcribeAudioBuffer };

