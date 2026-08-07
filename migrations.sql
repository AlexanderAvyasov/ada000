-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  telegram_chat_id bigint NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Создание таблицы магазинов
CREATE TABLE IF NOT EXISTS shops (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id_uzum integer NOT NULL,
  api_token_encrypted text NOT NULL,
  brief_time text NOT NULL DEFAULT '08:00',
  min_stock_days integer NOT NULL DEFAULT 5,
  roi_threshold_percent integer NOT NULL DEFAULT 15,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, shop_id_uzum)
);

-- Создание таблицы ежедневных снимков
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date date NOT NULL,
  raw_payload jsonb NOT NULL,
  computed_metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
