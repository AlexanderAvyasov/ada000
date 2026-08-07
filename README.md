# SellerPilot Daily Brief

MVP Telegram bot для продавцов Uzum.

Этот проект отправляет ежедневный дайджест, который помогает отслеживать:
- товары с низким остатком,
- товары с ROI ниже порога,
- товары с резким изменением цены,
- просроченные заказы,
- прибыль за вчера.

## Структура проекта

- `src/bot.ts` — Telegram-бот и команды
- `src/scheduler.ts` — планировщик ежедневной рассылки
- `src/uzumClient.ts` — Uzum Seller OpenAPI client с retry
- `src/metrics.ts` — бизнес-логика расчёта метрик
- `src/briefFormatter.ts` — формирование текста и inline-кнопок
- `src/db/client.ts` — Supabase клиент
- `src/db/users.ts`, `src/db/shops.ts`, `src/db/snapshots.ts` — доступ к данным
- `src/config.ts` — загрузка переменных окружения
- `.env.example` — пример настроек
- `migrations.sql` — SQL для создания таблиц

## Установка

1. Клонируйте репозиторий.
2. Создайте `.env` на основе `.env.example`.
3. Установите зависимости:

```bash
npm install
```

4. Запустите локально:

```bash
npm run dev
```

> В режиме разработки используется Node ESM загрузчик `ts-node/esm`, чтобы TypeScript файлы с импортами `*.js` корректно запускались в `type: module` проекте.

5. Для production-сборки:

```bash
npm run build
npm start
```

## Переменные окружения

- `TELEGRAM_BOT_TOKEN` — токен Telegram-бота от `@BotFather`
- `SUPABASE_URL` — URL проекта Supabase
- `SUPABASE_KEY` — ключ Supabase (anon или service key)
- `SUPABASE_SERVICE_ROLE_KEY` — *(рекомендуется для продакшена на сервере)* service_role ключ Supabase для серверных операций (Row Level Security может блокировать вставки с publishable ключа)
- `ENCRYPTION_SECRET` — секрет для шифрования токена Uzum
- `DEFAULT_BRIEF_TIME` — время рассылки по умолчанию в формате `HH:MM`
- `DEFAULT_MIN_STOCK_DAYS` — порог дней остатка для тревоги
- `DEFAULT_ROI_THRESHOLD` — порог ROI для тревоги
- `SCHEDULE_CHECK_INTERVAL_MINUTES` — интервал проверки планировщика

## Таблицы базы данных

Выполните SQL из `migrations.sql` в вашей базе Supabase. Он создаёт таблицы:

- `users` (id, telegram_chat_id, created_at)
- `shops` (id, user_id, shop_id_uzum, api_token_encrypted, brief_time, min_stock_days, roi_threshold_percent, active)
- `daily_snapshots` (id, shop_id, date, raw_payload, computed_metrics, created_at)

## Развертывание

### Railway Free Tier

1. Создайте проект Railway.
2. Настройте переменные окружения.
3. Установите команду запуска `./start.sh`.

### Supabase Edge Functions + внешний cron

1. Задеплойте HTTP endpoint, который вызывает бота.
2. Используйте бесплатный cron-сервис (cron-job.org или аналог) для вызова endpoint каждые 5-10 минут.
3. На проде `node-cron` можно не использовать, если внешний cron уже вызывает процесс.

## Что настроить вручную

- создать Telegram-бота у `@BotFather`
- создать проект Supabase и получить URL + ключ
- заполнить `.env`
- выполнить SQL из `migrations.sql`
- запустить `npm install` и `npm run dev`
- на проде запускать `./start.sh`

## Railway (Docker) — быстрое развёртывание

Если вы хотите задеплоить приложение через Railway с использованием Dockerfile, выполните следующие шаги:

1. Убедитесь, что в репозитории присутствуют `Dockerfile` и `.dockerignore` (созданы автоматически).
2. Запушьте изменения в GitHub и подключите репозиторий к Railway (New Project → Deploy from GitHub).
3. В настройках проекта Railway добавьте переменные окружения (Environment):
	- `TELEGRAM_BOT_TOKEN`
	- `SUPABASE_URL`
	- `SUPABASE_KEY` (или `SUPABASE_SERVICE_ROLE_KEY` для серверных операций)
	- `ENCRYPTION_SECRET`
	- `DEFAULT_BRIEF_TIME` (например `09:00`)
	- `DEFAULT_MIN_STOCK_DAYS`, `DEFAULT_ROI_THRESHOLD` и другие по необходимости
4. Railway автоматически соберёт Docker-образ, используя `Dockerfile`. По умолчанию контейнер запускает
	`node ./dist/index.js`. Railway не требует веб-порта для фоновых процессов, но если потребуется —
	настройте `PORT` в переменных окружения и измените код/скрипт запуска.
5. (Опция) Если собираетесь использовать GHCR/AWS Docker Registry: вы можете настроить workflow CI, который будет
	билдить и пушить образ в registry, а Railway — тянуть образ оттуда.

Совет по безопасности: обязательно добавьте `SUPABASE_SERVICE_ROLE_KEY` только в секцию секретов Railway и не коммитьте
ключи в репозиторий. При смене токенов Uzum — отозовите старые и замените в Railway Secrets.

Примеры команд для локальной проверки образа:

```bash
# собирать docker-образ локально
docker build -t sellerpilot:latest .
# запуск контейнера
docker run --env-file .env -it sellerpilot:latest
```

