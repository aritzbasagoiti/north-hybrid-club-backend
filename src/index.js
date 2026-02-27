require('dotenv').config();
const express = require('express');
const cors = require('cors');
const trainingRoutes = require('./routes/trainingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Si llega JSON inválido, devolvemos 400 (no 500 genérico)
app.use((err, req, res, next) => {
  const isJsonSyntax =
    err &&
    (err instanceof SyntaxError || err.type === 'entity.parse.failed') &&
    err.status === 400;
  if (isJsonSyntax) {
    return res.status(400).json({ status: 'error', error: 'JSON inválido' });
  }
  return next(err);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'north-hybrid-club-api' });
});

// Diagnóstico seguro (no expone secretos). Protegido por CHAT_API_KEY si existe.
app.get('/debug/status', (req, res) => {
  const required = process.env.CHAT_API_KEY;
  if (required) {
    const incoming = String(req.headers['x-api-key'] || '');
    if (!incoming || incoming !== required) {
      return res.status(401).json({ status: 'error', error: 'No autorizado' });
    }
  }

  res.json({
    status: 'ok',
    env: {
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasTelegramWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      hasChatApiKey: Boolean(process.env.CHAT_API_KEY)
    }
  });
});

app.use('/', trainingRoutes);
app.use('/', webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 'error', error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', error: 'Error interno del servidor' });
});

// En local: listen. En Vercel: solo export (Vercel maneja el servidor)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`NORTH Hybrid Club API en http://localhost:${PORT}`);
  });
}

module.exports = app;
