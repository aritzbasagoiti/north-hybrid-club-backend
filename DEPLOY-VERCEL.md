# Desplegar en Vercel

## 1. Subir el proyecto a GitHub

Si aún no lo tienes en GitHub:

```bash
cd north-hybrid-club-backend
git init
git add .
git commit -m "Backend NORTH Hybrid Club"
```

Crea un repositorio en [github.com](https://github.com/new) y luego:

```bash
git remote add origin https://github.com/TU_USUARIO/north-hybrid-club-backend.git
git branch -M main
git push -u origin main
```

---

## 2. Conectar con Vercel

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (con GitHub).
2. Click en **Add New** → **Project**.
3. Importa el repositorio `north-hybrid-club-backend`.
4. **Root Directory:** deja por defecto (o `north-hybrid-club-backend` si está dentro de otro repo).
5. **Build Command:** vacío o `npm run build` si existe.
6. **Output Directory:** vacío (es una API, no un frontend estático).

---

## 3. Variables de entorno

En **Project Settings** → **Environment Variables**, añade:

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | https://gvptazvoftpyhbfrmlfe.supabase.co |
| `SUPABASE_SERVICE_KEY` | tu Secret key de Supabase |
| `OPENAI_API_KEY` | tu API key de OpenAI |

---

## 4. Desplegar

Click en **Deploy**. En unos minutos tendrás una URL como:

```
https://north-hybrid-club-backend-xxx.vercel.app
```

---

## 5. Configurar el bot de Telegram

En el `.env` del bot, cambia:

```
API_BASE_URL=https://tu-url.vercel.app
```

Reinicia el bot. Ya podrás usar el chat con el backend en la nube.

---

## Rutas de la API

- `GET /health` - Health check
- `POST /save-training` - Guardar entrenamiento
- `POST /chat` - Chat con IA
- `GET /weekly-report/:telegram_id`
- `GET /monthly-report/:telegram_id`
