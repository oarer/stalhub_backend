# Модуль /tier-lists

**Tier-листы: рейтинги брони и оружия. PUB-листы пользователей и generated SYSTEM-листы, фильтры, просмотры.**

---

## Общие сведения

Все пути имеют префикс `/api/v1`.

**Права:**
- `tier_lists:manage` — позволяет обновлять/удалять любой лист (включая чужие). Без него обновление/удаление доступно только автору листа.
- Создание — только авторизованный пользователь (`requireAuth`).
- `GET /tier-lists` и `GET /tier-lists/:id` — публичны; на списке используется `requireOptionalAuth`, чтобы персонализировать видимость. `GET /tier-lists/mine` — только для авторизованных.

**Виды листов (`TierListKind`):**
- `SYSTEM` — сгенерированные автоматически листы (см. генератор); в этих роутах создать/обновить их нельзя — `list` возвращает только публичные строки, а мутации ограничены автором.
- `USER` — листы, создаваемые тут.

При `GET /tier-lists/:id` для листа `SYSTEM` дополнительно резолвится `previous_version` — предыдущая сгенерированная версия в той же категории (для сравнения).

**Тип предметов (`TierItemKind`):** `ARMOR`, `WEAPON`.

**Ранги (`TierRank`):** `S`, `A`, `B`, `C`, `D`, `E`.

**Категории `category`:** `general`, `assault_rifle`, `sniper_rifle`, `shotgun_rifle`, `submachine_gun`, `machine_gun`, `pistol`.

**Внешний ID:** `external_id` — slug из заголовка; lookup по id или slug в `GET /:id`, `PATCH` и `DELETE`.

**Видимость:** `list` возвращает только листы c `is_public: true`; приватные листы доступны автору через `GET /tier-lists/mine`. У USER-листов по умолчанию `is_public: true`, `item_kind` по умолчанию `WEAPON`.

**Просмотры:** `GET /:id` записывает дедуплицированный просмотр (авторизованный — по `user_id`, аноним — по `sha256(ip + user-agent)`), TTL 12 часов; уникальный просмотр инкрементирует `views` и метрику `content_views_total{type="tier_list"}`.

**Обновление:** при передаче `entries` ENTITY-список заменяется целиком (`deleteMany` + `createMany`, не транзакция); `position` по умолчанию `0`.

---

## `GET /tier-lists`
Список публичных tier-листов с фильтрами. Сортировка — по `created_at` (убывание).

### Авторизация
`requireOptionalAuth` — доступно без токена.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `take` | Кол-во элементов (по умолчанию `24`) | `number` | Нет |
| `page` | Номер страницы (по умолчанию `1`) | `number` | Нет |
| `kind` | Вид листа: `SYSTEM` / `USER` | `"SYSTEM" \| "USER"` | Нет |
| `item_kind` | Тип предметов: `ARMOR` / `WEAPON` | `"ARMOR" \| "WEAPON"` | Нет |
| `category` | Категория (точное совпадение) | `string` | Нет |

### Тело ответа
```json
{
  "data": [
    {
      "id": 1,
      "external_id": "slug",
      "title": "Тирлист оружия",
      "description": "Описание",
      "kind": "USER",
      "item_kind": "WEAPON",
      "scenario": null,
      "category": "assault_rifle",
      "views": 42,
      "is_public": true,
      "is_current": true,
      "generated_at": null,
      "author": { "id": 1, "name": "Имя", "username": "ник" },
      "entry_count": 6,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total_count": 1,
  "page": 1,
  "take": 24
}
```

---

## `GET /tier-lists/mine`
Список листов текущего пользователя (включая приватные).

### Авторизация
Требуется `requireAuth`.

### Параметры (query)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `take` | Кол-во элементов (по умолчанию `24`) | `number` | Нет |
| `page` | Номер страницы (по умолчанию `1`) | `number` | Нет |

### Тело ответа
Аналогично `GET /tier-lists`, но `data` содержит только листы с `author_id` = текущий пользователь (без фильтра `is_public`).

---

## `GET /tier-lists/:id`
Получение листа по числовому id или `external_id`-slug. Записывает дедуплицированный просмотр. Без авторизации.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `id` | Числовой id или slug `external_id` | `string` | Да |

### Тело ответа
```json
{
  "id": 1,
  "external_id": "slug",
  "title": "Тирлист оружия",
  "description": "Описание",
  "views": 15,
  "kind": "SYSTEM",
  "item_kind": "WEAPON",
  "scenario": "Сценарий",
  "category": "assault_rifle",
  "is_public": true,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "is_current": true,
  "removed_at": null,
  "author": { "id": 1, "name": "Имя", "username": "ник" },
  "entries": [
    { "id": 1, "item_id": "item-1", "rank": "S", "ttk": null, "position": 0 }
  ],
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "previous_version": null
}
```
`views` учитывает прирост при уникальном просмотре; `entries` сортируются по `position` (возрастание). Для листов `SYSTEM` с `category` заполняется `previous_version` — сериализованный предыдущий лист той же категории (`is_current: false`, `removed_at: null`, другой `external_id`), либо `null`.

### Возможные ошибки
- **404** — лист не найден

---

## `POST /tier-lists`
Создание USER-листа. Создаются записи `entries` (если переданы). Спам-проверок нет.

### Авторизация
Требуется `requireAuth`.

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `title` | Заголовок, ≤ 200 | `string` | Да |
| `description` | Описание, ≤ 2000 (по умолчанию `''`) | `string` | Нет |
| `item_kind` | Тип предметов: `ARMOR` / `WEAPON` (по умолчанию `WEAPON`) | `"ARMOR" \| "WEAPON"` | Нет |
| `is_public` | Публичность (по умолчанию `true`) | `boolean` | Нет |
| `scenario` | Сценарий | `string` | Нет |
| `category` | Категория (7 значений, см. «Общие сведения») | `enum` | Нет |
| `entries` | Массив записей | `object[]` | Нет |

Поля записи `entries`:
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `item_id` | id предмета | `string` | Да |
| `rank` | Ранг (`S`,`A`,`B`,`C`,`D`,`E`) | `string` | Да |
| `position` | Позиция (по умолчанию `0`) | `number` | Нет |

### Тело ответа
```json
{
  "id": 1,
  "external_id": "slug",
  "title": "Тирлист оружия",
  "description": "",
  "kind": "USER",
  "item_kind": "WEAPON",
  "scenario": null,
  "category": null,
  "is_public": true,
  "author": { "id": 1, "name": "Имя", "username": "ник" },
  "entries": [
    { "id": 1, "item_id": "item-1", "rank": "S", "ttk": null, "position": 0 }
  ],
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```
`items` создаются в БД (`kind: USER`), `position` по умолчанию `0`.

### Возможные ошибки
- **401** — нет авторизации
- **400** — нет `title` (обязателен), невалидные `entries` (валидация Elysia)

---

## `PATCH /tier-lists/:id`
Частичное обновление листа. Автор или пользователь с `tier_lists:manage`. Обновление по числовому id или slug.

### Авторизация
Требуется `requireAuth`.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `id` | Числовой id или slug `external_id` | `string` | Да |

### Параметры (body)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `title` | ≤ 200 | `string` | Нет |
| `description` | ≤ 2000 | `string` | Нет |
| `category` | Категория (7 значений) | `enum` | Нет |
| `is_public` | Публичность | `boolean` | Нет |
| `entries` | Массив записей (полностью заменяет текущие) | `object[]` | Нет |

### Тело ответа
Обновлённый лист (структура как в `POST`). При передаче `entries` старые записи удаляются и создаются заново (`position` по умолчанию `0`).

### Возможные ошибки
- **401** — нет авторизации
- **403** — не автор и нет `tier_lists:manage` (`{ "error": "Forbidden" }`)
- **404** — лист не найден

---

## `DELETE /tier-lists/:id`
Удаление листа. Автор или пользователь с `tier_lists:manage`. По числовому id или slug.

### Авторизация
Требуется `requireAuth`.

### Параметры (path)
| Поле | Описание | Тип | Обязательный |
| ---- | -------- | --- | :----------: |
| `id` | Числовой id или slug `external_id` | `string` | Да |

### Тело ответа
```json
{ "success": true }
```

### Возможные ошибки
- **401** — нет авторизации
- **403** — не автор и нет `tier_lists:manage`