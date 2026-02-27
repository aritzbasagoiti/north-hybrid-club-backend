const express = require('express');
const { saveTraining } = require('../services/trainingService');
const { getWeeklyReport, getMonthlyReport } = require('../services/reportService');
const { chat, clearHistory } = require('../services/chatService');

const router = express.Router();

function requireApiKey(req, res, next) {
  const required = process.env.CHAT_API_KEY;
  if (!required) return next();
  const incoming = String(req.headers['x-api-key'] || '');
  if (!incoming || incoming !== required) {
    return res.status(401).json({ status: 'error', error: 'No autorizado' });
  }
  return next();
}

/**
 * POST /chat - IA conversacional tipo ChatGPT
 * Body: { telegram_id: string, message: string }
 */
router.post('/chat', requireApiKey, async (req, res) => {
  try {
    const { telegram_id, message } = req.body;

    if (!telegram_id || !message || typeof message !== 'string') {
      return res.status(400).json({
        status: 'error',
        error: 'telegram_id y message son requeridos'
      });
    }

    const reply = await chat(String(telegram_id), message.trim());

    res.json({ status: 'ok', reply });
  } catch (err) {
    console.error('POST /chat error:', err);
    res.status(500).json({
      status: 'error',
      error: err.message || 'Error al generar respuesta'
    });
  }
});

/**
 * POST /chat/clear - Limpiar historial de conversación
 * Body: { telegram_id: string }
 */
router.post('/chat/clear', requireApiKey, async (req, res) => {
  const { telegram_id } = req.body;
  if (telegram_id) await clearHistory(String(telegram_id));
  res.json({ status: 'ok' });
});

/**
 * POST /save-training
 * Body: { telegram_id: string, message: string }
 */
router.post('/save-training', requireApiKey, async (req, res) => {
  try {
    const { telegram_id, message } = req.body;

    if (!telegram_id) {
      return res.status(400).json({
        status: 'error',
        error: 'telegram_id es requerido'
      });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        status: 'error',
        error: 'message es requerido y debe ser string'
      });
    }

    const { saved, metrics } = await saveTraining(String(telegram_id), message.trim());

    const savedExercise = metrics.map((m) => m.exercise).join(', ');

    res.json({
      status: 'ok',
      saved_exercise: savedExercise || 'entrenamiento',
      metrics,
      saved_count: saved.length
    });
  } catch (err) {
    console.error('POST /save-training error:', err);
    res.status(500).json({
      status: 'error',
      error: err.message || 'Error al guardar entrenamiento'
    });
  }
});

/**
 * GET /weekly-report/:telegram_id
 */
router.get('/weekly-report/:telegram_id', requireApiKey, async (req, res) => {
  try {
    const { telegram_id } = req.params;
    if (!telegram_id) {
      return res.status(400).json({
        status: 'error',
        error: 'telegram_id es requerido'
      });
    }

    const result = await getWeeklyReport(telegram_id);

    res.json({
      status: 'ok',
      summary: result.summary,
      metrics: result.metrics
    });
  } catch (err) {
    console.error('GET /weekly-report error:', err);
    res.status(500).json({
      status: 'error',
      error: err.message || 'Error al generar informe semanal'
    });
  }
});

/**
 * GET /monthly-report/:telegram_id
 */
router.get('/monthly-report/:telegram_id', requireApiKey, async (req, res) => {
  try {
    const { telegram_id } = req.params;
    if (!telegram_id) {
      return res.status(400).json({
        status: 'error',
        error: 'telegram_id es requerido'
      });
    }

    const result = await getMonthlyReport(telegram_id);

    res.json({
      status: 'ok',
      summary: result.summary,
      metrics: result.metrics
    });
  } catch (err) {
    console.error('GET /monthly-report error:', err);
    res.status(500).json({
      status: 'error',
      error: err.message || 'Error al generar informe mensual'
    });
  }
});

module.exports = router;
