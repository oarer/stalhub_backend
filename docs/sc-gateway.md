# SC Gateway — система нод

Запрос приходит на бэк, бэк выбирает токен со свободной квотой
и распределяет исполнение между удалёнными нодами-воркерами
(отдельный репозиторий [stalhub_node](https://github.com/oarer/stalhub_node)).

## Правила квоты (два уровня, стоимость 1, auction — 2)

- **Токен** — 200 использований в минуту. Квота исчерпана — gateway молча берёт следующий токен; все пусты — ответ `429`.
- **Нода (egress IP)** — 800 использований в минуту (сам eAPI держит ~900, 800 — с запасом для стабильности). Квота исчерпана — нода пропускается, запрос уходит на следующую; все заняты — прямое исполнение с бэкенда (у него своя IP-квота 800 под ключом `direct`); всё занято — `429`.
- Счётчики — фиксированное минутное окно в Redis (`sc:quota:token:<id>:<bucket>`, `sc:quota:node:<id>:<bucket>`), при недоступности Redis — in-memory fallback.

## Маршрутизация

1. `costOf(path)` считает стоимость запроса.
2. `pickToken(cost)` — round-robin по включённым токенам, атомарно
   резервирует квоту токена (`INCRBY`, при перелимите — откат).
3. `pickNode(cost)` — round-robin по включённым нодам, атомарно
   резервирует IP-квоту ноды; ноды без квоты пропускаются.
4. `POST {node}/sc/execute` с Bearer-ключом ноды и токеном в теле.
5. Ошибка сети ноды — оба резерва возвращаются, запрос уходит
   на следующую ноду. `429` от eAPI — берётся следующий токен.
6. Нод с квотой нет — прямое исполнение с бэкенда под IP-квотой `direct`
   (`SC_GATEWAY_DIRECT_FALLBACK=true` по умолчанию).

Через gateway идут все запросы с **серверным** токеном:
auction, player profile/operations, clan info, arsenal prices, lots-puller.
Запросы с **личными** токенами пользователей (`_skipAuth`) идут напрямую,
как раньше.

## Админка (`/api/v1/admin/sc`, нужны auth + `user:manage`)

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/overview` | Сводка: лимиты, ноды, токены с live-использованием |
| `GET` | `/nodes` | Список нод |
| `POST` | `/nodes` | Добавить ноду `{name, base_url, api_key?, priority?, timeout_ms?, enabled?}` |
| `PATCH` | `/nodes/:id` | Обновить ноду |
| `DELETE` | `/nodes/:id` | Удалить ноду |
| `POST` | `/nodes/:id/ping` | Healthcheck ноды (`{ok, latency_ms}`) |
| `GET` | `/tokens` | Токены с текущими лимитами `{used, remaining, reset_at}` |
| `POST` | `/tokens` | Добавить токен `{label?, token}` |
| `POST` | `/tokens/bulk` | Загрузка пачкой: текст (разделители — пробелы/запятые/переносы) или массив; ответ `{created, skipped, total}` |
| `PATCH` | `/tokens/:id` | `{label?, enabled?}` |
| `DELETE` | `/tokens/:id` | Удалить токен |

Токены хранятся шифрованными (`ENCRYPT_KEY`), в API видны только
первые метки и последние 6 символов (`tail`). Дубли отсекаются по sha256.

## Метрики (Prometheus)

- `sc_gateway_requests_total{node, status}` — запросы через gateway
- `sc_gateway_tokens_exhausted_total` — отказы по исчерпанию всех токенов
- `sc_gateway_nodes_exhausted_total` — отказы по исчерпанию всех IP-квот
- `sc_gateway_nodes_up` / `sc_gateway_tokens_up` — включённые ноды/токены

## Env

- `EXBO_TOKEN` — legacy-токен; при пустой таблице токенов один раз
  импортируется в пул на старте (label `env:EXBO_TOKEN`).
- `SC_GATEWAY_DIRECT_FALLBACK` — прямое исполнение без нод (default `true`).
