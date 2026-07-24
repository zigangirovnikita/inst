# Деплой

Требуется Node.js 22.5–24.x: приложение использует встроенный модуль `node:sqlite`.

## Переменные и ассеты

1. Скопируй `.env.example` в `.env` и укажи ключи Apify, Polza AI и Telegram.
2. Скопируй 12 изображений для блока живого разбора в `public/assets/live-audit/` или задай абсолютный путь к ним через `LIVE_AUDIT_ASSETS_DIR`.
3. Запусти `npm start`.

Каталоги `data/` и `logs/` должны быть постоянными на сервере и доступны процессу Node для записи. При использовании Docker или PaaS подключи их как persistent volumes.

Перед публикацией выполни `npm run check`.

## Docker

Приложение слушает локальный порт `3100`, а наружу публикуется через reverse proxy:

```bash
docker compose up -d --build
```

Постоянные каталоги:

- `./data:/app/data`
- `./logs:/app/logs`
- `./public/assets/live-audit:/app/public/assets/live-audit:ro`

Для домена `insta.marketologii.ru` reverse proxy должен проксировать трафик на `http://127.0.0.1:3100`.
