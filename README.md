# NORTH Hybrid Club – Backend AI Coach

Backend para el asistente de IA del **NORTH Hybrid Club**, gimnasio híbrido especializado en HYROX, fuerza y condicionamiento funcional en Leioa (Bizkaia).

## Características

- **API REST** para guardar entrenamientos desde Telegram/WhatsApp
- **Extracción inteligente** de métricas con GPT (ejercicio, series, repeticiones, peso, distancia, tiempo)
- **Informes semanales y mensuales** automáticos
- **Supabase** como base de datos
- Listo para integrar con **Telegram Bot** (y luego WhatsApp)

---

## Requisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com)
- API Key de [OpenAI](https://platform.openai.com)

---

## Instalación

```bash
cd north-hybrid-club-backend
npm install
```

### Variables de entorno

Copia `.env.example` a `.env` y rellena:

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu-service-role-key
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=tu-token-botfather
TELEGRAM_WEBHOOK_SECRET=una-cadena-larga-y-secreta
CHAT_API_KEY=tu-api-key-opcional
PORT=3000
```

### Base de datos

Ejecuta el script `supabase-schema.sql` en el **SQL Editor** de tu proyecto Supabase para crear las tablas.
Si ya lo ejecutaste antes, ejecuta también `supabase-telegram-updates.sql` para habilitar deduplicación del webhook.

---

## Ejecutar

```bash
# Producción
npm start

# Desarrollo (con auto-reload)
npm run dev
```

---

## Documentación API

Base URL: `http://localhost:3000`

### Health check

```
GET /health
```

**Respuesta:**
```json
{ "status": "ok", "service": "north-hybrid-club-api" }
```

---

### Guardar entrenamiento

```
POST /save-training
Content-Type: application/json
```

**Body:**
```json
{
  "telegram_id": "123456789",
  "message": "Hoy hice 3x8 con 90kg en sentadilla y corrí 5km en 27:30"
}
```

**Respuesta OK (200):**
```json
{
  "status": "ok",
  "saved_exercise": "sentadilla, carrera",
  "metrics": [
    {
      "exercise": "sentadilla",
      "sets": 3,
      "reps": 8,
      "weight": 90,
      "time_seconds": null,
      "distance_km": null
    },
    {
      "exercise": "carrera",
      "sets": null,
      "reps": null,
      "weight": null,
      "time_seconds": 1650,
      "distance_km": 5
    }
  ],
  "saved_count": 2
}
```

**Errores:**
- `400`: `telegram_id` o `message` faltantes/inválidos
- `500`: Error de base de datos o GPT

---

### Informe semanal

```
GET /weekly-report/:telegram_id
```

**Ejemplo:** `GET /weekly-report/123456789`

**Respuesta OK (200):**
```json
{
  "status": "ok",
  "summary": "Resumen últimos 7 días:\n- Sesiones registradas: 5\n...",
  "metrics": {
    "sessions": 5,
    "exercises": ["sentadilla", "press banca", "carrera"]
  }
}
```

---

### Informe mensual

```
GET /monthly-report/:telegram_id
```

**Ejemplo:** `GET /monthly-report/123456789`

Misma estructura de respuesta que el informe semanal, pero para el mes en curso.

---

## Integración con Telegram Bot

El bot de Telegram debe:

1. **Al recibir un mensaje de entrenamiento del usuario**  
   Hacer `POST /save-training` con `telegram_id` (del chat) y `message` (texto enviado).

2. **Para comando "Informe semanal"**  
   Llamar `GET /weekly-report/{telegram_id}` y enviar el `summary` al usuario.

3. **Para comando "Informe mensual"**  
   Llamar `GET /monthly-report/{telegram_id}` y enviar el `summary` al usuario.

Ejemplo mínimo (Node.js) desde el bot:

```javascript
// Guardar entrenamiento
await fetch('https://tu-api.com/save-training', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ telegram_id: chatId.toString(), message: userMessage })
});
```

---

## Bot de Telegram

Hay un bot de Telegram listo en la carpeta `telegram-bot/`:

```bash
cd telegram-bot
npm install
```

Copia `.env.example` a `.env` y configura:
- `TELEGRAM_BOT_TOKEN` - Token de [@BotFather](https://t.me/BotFather)
- `API_BASE_URL` - URL de tu backend (ej: `http://localhost:3000`)

```bash
npm start
```

Comandos del bot:
- **Cualquier mensaje** → Guarda el entrenamiento
- `/semana` → Informe semanal
- `/mes` → Informe mensual

---

## Estructura del proyecto

```
north-hybrid-club-backend/
├── src/
│   ├── config/
│   │   └── supabase.js      # Cliente Supabase
│   ├── services/
│   │   ├── gptExtractor.js  # Extracción de métricas con GPT
│   │   ├── userService.js   # Usuarios (get/create)
│   │   ├── trainingService.js
│   │   └── reportService.js
│   ├── routes/
│   │   └── trainingRoutes.js
│   └── index.js
├── telegram-bot/            # Bot de Telegram
│   ├── index.js
│   └── package.json
├── supabase-schema.sql
├── .env.example
└── package.json
```

---

## Licencia

MIT
