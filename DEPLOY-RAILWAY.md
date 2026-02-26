# Desplegar en Railway

## 1. Crear cuenta
- Ve a [railway.app](https://railway.app)
- **Login** con GitHub

## 2. Nuevo proyecto
1. **New Project**
2. **Deploy from GitHub repo**
3. Conecta GitHub si no lo has hecho
4. Selecciona `aritzbasagoiti/north-hybrid-club-backend`

## 3. Variables de entorno
En el proyecto → **Variables** → **Add Variable** (o **Raw Editor**):

```
SUPABASE_URL=https://gvptazvoftpyhbfrmlfe.supabase.co
SUPABASE_SERVICE_KEY=tu-secret-key
OPENAI_API_KEY=tu-openai-key
TELEGRAM_BOT_TOKEN=tu-token-botfather
```

## 4. Configurar
- **Settings** → **Build**: Railway detecta Node.js automáticamente
- **Settings** → **Deploy**: Start command = `npm start` (por defecto)
- **Settings** → **Networking** → **Generate Domain** para obtener la URL pública

## 5. Desplegar
Railway despliega automáticamente al conectar el repo. Espera a que termine.

## 6. Obtener la URL
- **Settings** → **Networking** → **Public Networking** → **Generate Domain**
- Te dará algo como: `north-hybrid-club-backend-production.up.railway.app`

## 7. Configurar webhook de Telegram
Abre en el navegador (sustituye TU_TOKEN y TU_URL):

```
https://api.telegram.org/botTU_TOKEN/setWebhook?url=https://TU_URL/webhook/telegram
```

Ejemplo:
```
https://api.telegram.org/bot123:ABC/setWebhook?url=https://north-hybrid-club-backend-production.up.railway.app/webhook/telegram
```

---

**Nota:** Railway da $5 de crédito inicial. Después $1/mes gratis. Un backend pequeño suele entrar en esos límites.
