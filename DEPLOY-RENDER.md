# Desplegar en Render (para que funcione el webhook de Telegram)

Vercel tiene problemas de red al conectar con la API de Telegram. Render funciona correctamente.

## Pasos

### 1. Crear cuenta en Render
- Ve a [render.com](https://render.com)
- Regístrate con GitHub

### 2. Crear Web Service
1. **Dashboard** → **New** → **Web Service**
2. Conecta tu repositorio de GitHub: `aritzbasagoiti/north-hybrid-club-backend`
3. Configuración:
   - **Name:** north-hybrid-club-backend
   - **Region:** Frankfurt (o la más cercana)
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### 3. Variables de entorno
En **Environment** añade:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`

### 4. Desplegar
Click en **Create Web Service**. Espera unos minutos.

### 5. Configurar webhook
Cuando tengas la URL (ej: `https://north-hybrid-club-backend.onrender.com`), abre:

```
https://api.telegram.org/botTU_TOKEN/setWebhook?url=TU_URL_RENDER/webhook/telegram
```

Ejemplo:
```
https://api.telegram.org/botXXX/setWebhook?url=https://north-hybrid-club-backend.onrender.com/webhook/telegram
```

---

**Nota:** El plan gratuito de Render pone el servicio en "sleep" tras 15 min sin uso. La primera petición puede tardar ~30 segundos en despertar.
