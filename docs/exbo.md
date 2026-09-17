# EXBO

**Прокси-модуль профилей игроков Stalcraft (EXBO API), работающий поверх OAuth-учётки самого пользователя.**

## Общие сведения

- Маршрут проксирует запросы в EXBO API (`https://eapi.stalcraft.net`) через общий axios-клиент (`src/app/interceptors/sc.interceptor.ts`) с **личным** Bearer-токеном пользователя, а не серверным: при запросах указывается `_skipAuth`, чтобы туда не подставлялся дефолтный `Authorization: Bearer <EXBO_TOKEN>`.
- Токен берётся из связанной с пользователем записи `eXBOAuth` — поле `token_blob` (зашифрованный JSON `{ access_token, refresh_token? }`).
- Интерцептор: таймаут 10 с, HTTP 429 повторяется ровно один раз без бек-оффа, все остальные ошибки нормализуются в `{ status, message, details }`.
- Кэш профилей — Redis: ключ `exbo:profile:<region>:<character>` (имя персонажа приводится к нижнему регистру), TTL 30 минут.
- Профили перед кэшированием сужаются: `displayedAchievements` вырезаются, из `stats` остаются только разрешённые id (см. ниже).

---

## `GET /api/v1/exbo/:region/characters`

Список персонажей пользователя в регионе и профили каждого (список + запрос каждого профиля по имени).

### Гард

`requireAuth` — обязательная авторизация по JWT-cookie `access_token` (сессия должна существовать и не быть отозванной, пользователь не должен быть забанен).

### Параметры (path)

| Поле     | Описание             | Тип      | Обязательный |
| -------- | -------------------- | -------- | :----------: |
| `region` | Регион игры          | `string` | Да           |

### Порядок работы

1. По `user_id` ищется связанная запись `eXBOAuth`; если её нет — **404** `{ "error": "EXBO account not linked" }`.
2. Из `token_blob` расшифровывается `access_token`.
3. Уходит запрос `GET /{region}/characters` в EXBO API.
4. Для каждого персонажа: если профиль есть в Redis-кэше — возвращается он; иначе запрашивается `GET /{region}/character/by-name/{name}/profile` Личным токеном, результат фильтруется, кладётся в кэш (на 30 мин) и возвращается.
5. Персонаж, профиль которого не удалось получить, не роняет весь запрос — вместо него в ответ попадает плейсхолдер со `status: "error"`.

### Тело ответа

Массив профилей (тип `PlayerResponse`):

```json
[
  {
    "username": "Nick",
    "uuid": "…",
    "status": "ok",
    "alliance": "merc",
    "lastLogin": "2025-01-01T00:00:00.000Z",
    "displayedAchievements": [],
    "clan": {
      "info": { "id": "…", "name": "…", "level": 3, "registrationTime": "…", "alliance": "…", "description": "…", "leader": "…" },
      "member": { "name": "Nick", "rank": "OFFICER", "joinTime": "…" }
    },
    "stats": [
      { "id": "kil", "type": "INTEGER", "value": 1542 }
    ]
  }
]
```

- `alliance` — одно из значений `merc`, `covenant`, `freedom`, `duty`, `bandits`, `stalkers`.
- `clan.member.rank` — строковые ранги API (`RECRUIT` … `LEADER`).
- `stats[]` — только разрешённые id: `reg-tim`, `pla-tim`, `bul-dea`, `kil`, `max-kil-ser`, `sho-hit`, `sho-fir`, `sho-hea`; `value` может быть числом, датой или строкой в зависимости от `type` (`INTEGER` / `DECIMAL` / `DATE` / `DURATION`).
- `displayedAchievements` всегда пустой массив (сужаются).
- Плейсхолдер ошибки: `{ username, uuid, status: "error", alliance: null, lastLogin: null, displayedAchievements: [], clan: null, stats: [] }`.

### Возможные ошибки

- **401** — не авторизован / сессия недействительна.
- **403** — аккаунт забанен или гостевой доступ ограничен.
- **404** — `{ "error": "EXBO account not linked" }` — аккаунт EXBO не привязан.
- **4xx/5xx** — ошибка вышестоящего EXBO API в нормализованном виде `{ status, message, details }`.

---