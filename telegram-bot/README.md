# NORTH Hybrid Club – Bot de Telegram

Bot que conecta Telegram con el backend API.

## Configuración

1. Crea un bot con [@BotFather](https://t.me/BotFather): envía `/newbot` y sigue los pasos.
2. Copia el token que te da BotFather.
3. Crea `.env` en esta carpeta:

```
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxx
API_BASE_URL=http://localhost:3000
```

- **Local:** `API_BASE_URL=http://localhost:3000` (con el backend corriendo)
- **Producción:** `API_BASE_URL=https://tu-api-desplegada.com`

## Ejecutar

```bash
npm install
npm start
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `/start` | Mensaje de bienvenida |
| Cualquier texto | Guarda el entrenamiento (ej: "3x8 sentadilla 90kg") |
| `/semana` | Informe de los últimos 7 días |
| `/mes` | Informe del mes actual |
