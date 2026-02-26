require('dotenv').config();
const express = require('express');
const cors = require('cors');
const trainingRoutes = require('./routes/trainingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'north-hybrid-club-api' });
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
