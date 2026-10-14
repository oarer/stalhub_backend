-- Auction DB: отдельный инстанс timescaledb-ha (см. docker-compose auction-db).
-- Применение: psql $AUCTION_DATABASE_URL -f schema.sql
-- ---------------------------------------------------------------------
-- items: словарь предметов. id — внутренний (наружу не торчит, фронт его
-- не видит; data_path — путь листинга EXBO вида /items/misc/g05g.json).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
	id SERIAL PRIMARY KEY,
	data_path TEXT NOT NULL UNIQUE,
	first_seen TIMESTAMPTZ,
	last_seen TIMESTAMPTZ,
	deals_count BIGINT NOT NULL DEFAULT 0,
	-- вотермарки ингеста (делают рестарт безопасным, без повторной работы):
	-- hist_newest: самая новая виденная сделка (свип идёт от неё вверх),
	-- hist_oldest: самая старая виденная сделка (бэкфилл идёт от неё вниз,
	-- возобновляется по времени, а не по оффсету — оффсеты плывут).
	hist_newest TIMESTAMPTZ,
	hist_oldest TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- deals: сырые сделки. TimescaleDB hypertable, чанки по месяцу
-- (создаются сами, руками партиции пилить не надо).
--
-- price — ТОТАЛ за сделку (проверено на живых данных: 10шт/750000),
-- цена штуки — generated-колонка unit_price. Все агрегаты — по unit_price.
--
-- Дедуп: у сделок EXBO нет id, поэтому UNIQUE по отпечатку
-- (item_id, occurred_at, price, amount) + INSERT ... ON CONFLICT DO NOTHING.
-- Теоретическая коллизия (две одинаковые сделки в одну секунду) гасится
-- в пользу первой — на медианы/свечи не влияет.
--
-- Компрессия: чанки старше 7 дней жмутся поколоночно
-- (segmentby item/qlt/ptn — это и даёт ~10x на тиковых данных).
-- Свежие чанки несжатые: туда идут свип и бэкфилл.
-- Нюанс: ON CONFLICT по сжатому чанку работает (чанк молча разжимается),
-- но медленнее — горячий путь у нас всегда по несжатым, так что ок.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deals (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	occurred_at TIMESTAMPTZ NOT NULL,
	price NUMERIC(14, 2) NOT NULL,
	amount INTEGER NOT NULL DEFAULT 1,
	-- цена штуки, всегда консистентна (CASE страхует от amount = 0,
	-- чтобы один кривой ряд не ронял весь батч)
	unit_price NUMERIC(14, 2)
		GENERATED ALWAYS AS (
			CASE
				WHEN amount > 0 THEN ROUND(price / amount, 2)
				ELSE price
			END
		) STORED,
	-- qlt: -1 = без качества (NULL нельзя: колонка входит в индексы
	-- и должна сравниваться строго; -1 в EXBO не встречается)
	qlt SMALLINT NOT NULL DEFAULT -1,
	ptn SMALLINT NOT NULL DEFAULT 0,
	additional TEXT
);

SELECT create_hypertable(
	'deals',
	'occurred_at',
	chunk_time_interval => INTERVAL '1 month',
	if_not_exists => TRUE
);

-- Дедуп отдельным unique-индексом (в UNIQUE-ограничении нельзя DESC,
-- а нам нужен именно такой порядок для "последних N продаж"):
-- (item_id, occurred_at DESC, price, amount).
-- INSERT ... ON CONFLICT DO NOTHING без арбитра гасит любой конфликт.
CREATE UNIQUE INDEX IF NOT EXISTS deals_dedup_uidx ON deals (
	item_id,
	occurred_at DESC,
	price,
	amount
);

-- Сырой JSON жмём lz4 в несжатых (свежих) чанках.
ALTER TABLE deals ALTER COLUMN additional SET COMPRESSION lz4;

ALTER TABLE deals SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'item_id,qlt,ptn',
	timescaledb.compress_orderby = 'occurred_at DESC'
);

SELECT add_compression_policy('deals', INTERVAL '7 days', if_not_exists => TRUE);

-- Сырые сделки живут 90 дней (хвост под "последние продажи", свежие
-- медианы и спрос — вся математика окна 90д считается по сырым).
-- Удаление — авто-политикой, мгновенным дропом чанков.
-- Глубже историю держат deal_buckets + candles_daily + buyer_daily.
SELECT add_retention_policy('deals', INTERVAL '90 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------
-- deal_buckets: предагрегация сырых сделок со счётчиком.
-- Строка = (день UTC, вариант, цена штуки, размер лота, buyer):
-- сколько таких сделок было. Пустой buyer ('') = анонимная сделка.
--
-- Зачем: цены кластеризуются на круглых числах, повторы схлопываются
-- в ~10-50x меньше строк. Медиана/avg/min/max/сделки/спрос из бакетов
-- считаются ТОЧНО (взвешенно по trades), buyer даёт топ покупателей.
-- Теряем только внутридневное время и атрибуты старых сделок
-- (они остаются в сырых 90 дней).
--
-- Размер лота (amount) хранится ТОЧНЫМ ключом сознательно, не группами:
-- цена штуки зависит от размера пачки (опт дешевле розницы), и смешанная
-- медиана врёт. Группировка "топ размеров + разное" делается на чтении
-- (порог ~5% сделок размера за день), а не на записи: укрупнение при
-- записи необратимо, а из точных бакетов всегда можно собрать любые группы.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_buckets (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	day DATE NOT NULL,
	qlt SMALLINT NOT NULL DEFAULT -1,
	ptn SMALLINT NOT NULL DEFAULT 0,
	unit_price NUMERIC(14, 2) NOT NULL,
	amount INTEGER NOT NULL DEFAULT 1,
	buyer TEXT NOT NULL DEFAULT '',
	trades BIGINT NOT NULL DEFAULT 0,
	units BIGINT NOT NULL DEFAULT 0,
	PRIMARY KEY (item_id, day, qlt, ptn, unit_price, amount, buyer)
);

SELECT create_hypertable(
	'deal_buckets',
	'day',
	chunk_time_interval => INTERVAL '1 month',
	if_not_exists => TRUE
);

ALTER TABLE deal_buckets SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'item_id,qlt,ptn,buyer',
	timescaledb.compress_orderby = 'day DESC'
);

SELECT add_compression_policy('deal_buckets', INTERVAL '30 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------
-- deal_hours: внутридневка. Строка = (предмет, день UTC, час UTC, вариант):
-- сделки/штуки/деньги + мин/макс цены штуки. avg — generated (volume/units).
-- Без разреза по buyer и размеру (они в бакетах) — лёгкая таблица для
-- вопроса "когда продавать". Навсегда, объём крошечный.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_hours (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	day DATE NOT NULL,
	hour SMALLINT NOT NULL,
	qlt SMALLINT NOT NULL DEFAULT -1,
	ptn SMALLINT NOT NULL DEFAULT 0,
	trades BIGINT NOT NULL DEFAULT 0,
	units BIGINT NOT NULL DEFAULT 0,
	volume NUMERIC(18, 2) NOT NULL DEFAULT 0,
	avg NUMERIC(14, 2)
		GENERATED ALWAYS AS (
			CASE WHEN units > 0 THEN volume / units END
		) STORED,
	low NUMERIC(14, 2),
	high NUMERIC(14, 2),
	PRIMARY KEY (item_id, day, hour, qlt, ptn),
	CONSTRAINT deal_hours_hour_range CHECK (hour BETWEEN 0 AND 23)
);

SELECT create_hypertable(
	'deal_hours',
	'day',
	chunk_time_interval => INTERVAL '1 month',
	if_not_exists => TRUE
);

ALTER TABLE deal_hours SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'item_id,qlt,ptn',
	timescaledb.compress_orderby = 'day DESC, hour DESC'
);

SELECT add_compression_policy('deal_hours', INTERVAL '30 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------
-- buyer_daily: сводка по никам за день. Строка = (предмет, день, buyer):
-- сколько сделок, штук и денег. Пустой buyer ('') = анонимные сделки.
-- Строится роллапом из deal_buckets (там buyer уже в ключе).
-- Хранится навсегда (крошечная: предметы x дни x активные ники).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buyer_daily (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	day DATE NOT NULL,
	buyer TEXT NOT NULL DEFAULT '',
	trades BIGINT NOT NULL DEFAULT 0,
	units BIGINT NOT NULL DEFAULT 0,
	volume NUMERIC(18, 2) NOT NULL DEFAULT 0,
	PRIMARY KEY (item_id, day, buyer)
);

SELECT create_hypertable(
	'buyer_daily',
	'day',
	chunk_time_interval => INTERVAL '1 month',
	if_not_exists => TRUE
);

ALTER TABLE buyer_daily SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'item_id,buyer',
	timescaledb.compress_orderby = 'day DESC'
);

SELECT add_compression_policy('buyer_daily', INTERVAL '30 days', if_not_exists => TRUE);

-- ---------------------------------------------------------------------
-- candles_daily: суточные свечи по каждой паре (qlt, ptn).
-- Строится роллапом раз в сутки из deals. Основной путь чтения для
-- графиков: страница предмета = один SELECT, сырые deals не сканируются.
-- Хранится бессрочно (объём ничтожный: ~1.6к предметов x варианты x дни).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candles_daily (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	day DATE NOT NULL,
	qlt SMALLINT NOT NULL DEFAULT -1,
	ptn SMALLINT NOT NULL DEFAULT 0,
	trades BIGINT NOT NULL,
	amount BIGINT NOT NULL,
	avg NUMERIC(14, 2) NOT NULL,
	low NUMERIC(14, 2) NOT NULL,
	high NUMERIC(14, 2) NOT NULL,
	median NUMERIC(14, 2) NOT NULL,
	-- обогащение из бакетов (считается роллапом, всё точное):
	stddev NUMERIC(14, 2) NOT NULL DEFAULT 0,
	p10 NUMERIC(14, 2) NOT NULL,
	p25 NUMERIC(14, 2) NOT NULL,
	p75 NUMERIC(14, 2) NOT NULL,
	p90 NUMERIC(14, 2) NOT NULL,
	-- distinct непустых buyer за день
	buyers INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (item_id, day, qlt, ptn)
);

-- ---------------------------------------------------------------------
-- item_stats: предподсчитанная витрина для карточки предмета.
-- Строка на каждую пару (qlt, ptn). Обновляется роллапом
-- (медиана 90д, сделки 90д, спрос).
-- demand = сделки за последние 7 дней / средненедельные за прошлые 8
-- (1 — как обычно). Страница предмета читает N строк по вариантам.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_stats (
	item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
	qlt SMALLINT NOT NULL DEFAULT -1,
	ptn SMALLINT NOT NULL DEFAULT 0,
	median_90d NUMERIC(14, 2),
	deals_90d BIGINT NOT NULL DEFAULT 0,
	demand NUMERIC(8, 3),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (item_id, qlt, ptn)
);
