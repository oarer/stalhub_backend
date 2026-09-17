# Метрики

**Prometheus-метрики приложения: один общий реестр, дефолтные процессные метрики и прикладные счётчики/гистограммы/гейджи, отдаваемые по `GET /metrics`. Маршрут доступен без авторизации и исключён из RPS-лимита (префикс `/api/v1/metrics`).**

---

## `GET /api/v1/metrics`
Отдаёт собранные метрики в формате Prometheus text exposition. Заголовок `Content-Type` выставляется из `register.contentType`.

### Тело ответа
Текстовое представление метрик Prometheus, например:
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status="200"} 42
```

### Возможные ошибки
Ошибок нет (маршрут не имеет прикладных условий).

---

## Общие сведения

- Все HTTP-метрики подписаны **нормализованным** маршрутом (`normalizeRoute`) — динамические сегменты схлопываются в плейсхолдеры, чтобы не раздувать кардинальность лейблов.
- Нормализация (регэкспы, применяются к пути без префикса `/api/v1`): `/player/<char>/<что-то>` → `/player/:character/...`, `/auction/<id>/...` → `/auction/:id/...`, `/barter/<item>` → `/barter/:item_id`, числовые сегменты → `/:id`, UUID → `/:uuid`, любой токен ≥ 16 символов → `/:param`. Пусто/невозможно нормализовать → `unknown`.
- Каждый HTTP-запрос записывается в глобальном `onAfterHandle`-хуке (`http_requests_total` + `http_request_duration_seconds`).
- Собираются дефолтные процессные метрики Node.js/Bun (`collectDefaultMetrics`): event loop, память, циклы и т.п.

---

## Список метрик приложения

| Метрика | Тип | Лейблы | Описание |
| ------- | --- | ------ | -------- |
| `http_requests_total` | Counter | `method`, `route`, `status` | Общее число HTTP-запросов |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status` | Длительность HTTP-запросов; buckets `0.05, 0.1, 0.25, 0.5, 1, 2.5, 5` |
| `player_lookups_total` | Counter | `region` | Всего запросов профиля игрока |
| `player_lookup_errors_total` | Counter | `region` | Неудачных запросов профиля игрока |
| `blacklist_size` | Gauge | — | Текущее число игроков в блеклисте |
| `recent_players_size` | Gauge | — | Текущее число игроков в списке недавних |
| `popular_player_views_total` | Counter | — | Просмотры популярных игроков |
| `content_views_total` | Counter | `type` | Просмотры контента (builds, articles, arts, tier lists) |
| `auction_requests_total` | Counter | `region`, `type` | Всего запросов к API аукциона |
| `barter_requests_total` | Counter | — | Всего запросов бартера |
| `attachments_requests_total` | Counter | — | Всего запросов обвесов оружия |
| `exbo_api_requests_total` | Counter | `status` | Всего запросов к внешнему API EXBO |
| `exbo_api_request_duration_seconds` | Histogram | — | Длительность запросов к API EXBO; buckets `0.1, 0.5, 1, 2, 5, 10` |
| `app_errors_total` | Counter | `type` | Всего ошибок приложения |
| `ai_analysis_total` | Counter | `status` | Всего AI-анализов скриншотов |
| `ai_analysis_duration_seconds` | Histogram | — | Длительность AI-анализа; buckets `1, 5, 10, 30, 60` |
| `abuse_warnings_total` | Counter | `rule` | Предупреждения авто-бана (первое нарушение) |
| `auto_bans_total` | Counter | `rule` | Перманентные баны авто-бана (второе нарушение) |
| `ip_blocks_total` | Counter | — | Всего блокировок IP (rate limit / брутфорс) |
| `app_info` | Gauge | `version` | Информация о приложении (версия) |

---