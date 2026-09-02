-- ============================================================
--  MEDINA / Hotel Zhanatas — схема базы данных (Neon Postgres)
--  Можно выполнить целиком в Neon SQL Editor или через `npm run db:setup`.
--  Повторный запуск безопасен (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- Пользователи системы (доступ по логину)
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  login       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','reception','factory')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Гости (кто заселяется)
CREATE TABLE IF NOT EXISTS guests (
  id          SERIAL PRIMARY KEY,
  fio         TEXT NOT NULL,
  iin         TEXT DEFAULT '',
  company     TEXT DEFAULT '',
  citizenship TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Миграция для уже созданных баз: добавляем ИИН и гражданство.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS iin         TEXT DEFAULT '';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS citizenship TEXT DEFAULT '';

-- Персонал (повар, охрана и т.д.)
CREATE TABLE IF NOT EXISTS staff (
  id          SERIAL PRIMARY KEY,
  fio         TEXT NOT NULL,
  role        TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Комнаты (фиксированный фонд)
CREATE TABLE IF NOT EXISTS rooms (
  room        INT PRIMARY KEY
);

-- Заселения / брони
CREATE TABLE IF NOT EXISTS stays (
  id          SERIAL PRIMARY KEY,
  guest_id    INT REFERENCES guests(id) ON DELETE SET NULL,
  fio         TEXT NOT NULL,
  room        INT NOT NULL REFERENCES rooms(room),
  arrival     DATE NOT NULL,
  departure   DATE,
  status      TEXT NOT NULL DEFAULT 'on_shift' CHECK (status IN ('booked','on_shift','closed')),
  source      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Надёжность: в одной комнате не может быть двух активных (не закрытых) заселений.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_stay_per_room
  ON stays (room) WHERE status <> 'closed';

-- Категории доходов/расходов (с подкатегориями через parent_id)
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  ctype       TEXT NOT NULL CHECK (ctype IN ('income','expense')),
  parent_id   INT REFERENCES categories(id) ON DELETE CASCADE
);

-- Финансовые операции
CREATE TABLE IF NOT EXISTS finance (
  id          SERIAL PRIMARY KEY,
  ftype       TEXT NOT NULL CHECK (ftype IN ('income','expense')),
  category    TEXT DEFAULT '',
  subcategory TEXT DEFAULT '',
  amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  fdate       DATE NOT NULL,
  note        TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Смены персонала (в т.ч. отметки охраны по QR)
CREATE TABLE IF NOT EXISTS shifts (
  id          SERIAL PRIMARY KEY,
  fio         TEXT NOT NULL,
  role        TEXT DEFAULT '',
  sdate       DATE NOT NULL,
  shift       TEXT DEFAULT 'custom',
  hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  check_in    TIMESTAMPTZ,
  check_out   TIMESTAMPTZ,
  confirmed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shifts_fio_open_idx ON shifts (fio) WHERE check_in IS NOT NULL AND check_out IS NULL;
CREATE INDEX IF NOT EXISTS finance_fdate_idx ON finance (fdate);
CREATE INDEX IF NOT EXISTS stays_room_idx ON stays (room);

-- Настройки системы (ключ → значение). Пока используется отчётом заказчика.
CREATE TABLE IF NOT EXISTS settings (
  skey   TEXT PRIMARY KEY,
  svalue TEXT NOT NULL DEFAULT ''
);

-- Показывать ли номера комнат в отчёте заказчика ('1' — да, '0' — нет).
INSERT INTO settings (skey, svalue) VALUES ('report_show_rooms', '0')
ON CONFLICT (skey) DO NOTHING;

-- Ставки охраны за день выхода: будни (пн–пт) и выходные (сб, вс).
INSERT INTO settings (skey, svalue) VALUES ('guard_rate_weekday', '8000')
ON CONFLICT (skey) DO NOTHING;
INSERT INTO settings (skey, svalue) VALUES ('guard_rate_weekend', '10000')
ON CONFLICT (skey) DO NOTHING;

-- Выплаты охране. Платить можно частями, поэтому это отдельные записи,
-- а долг = начислено по сменам минус сумма выплат.
CREATE TABLE IF NOT EXISTS payments (
  id          SERIAL PRIMARY KEY,
  fio         TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  pdate       DATE NOT NULL,
  note        TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_fio_idx ON payments (fio);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments (pdate);

-- Комнатный фонд: два блока.
--   Блок 1 — комнаты 101..112 (12 шт.)
--   Блок 2 — комнаты 201..216 (16 шт.)
-- Итого 28 комнат. Блок определяется первой цифрой номера.
INSERT INTO rooms (room)
SELECT generate_series(101, 112)
ON CONFLICT (room) DO NOTHING;

INSERT INTO rooms (room)
SELECT generate_series(201, 216)
ON CONFLICT (room) DO NOTHING;
