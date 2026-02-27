const OpenAI = require('openai');
const { toFile } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudioBuffer(buffer, filename = 'audio.ogg') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Falta OPENAI_API_KEY para transcribir audio');
  }
  const file = await toFile(buffer, filename);
  const result = await openai.audio.transcriptions.create({
    model: 'gpt-4o-mini-transcribe',
    file
  });
  if (typeof result === 'string') return result;
  return result.text || '';
}

module.exports = { transcribeAudioBuffer };

