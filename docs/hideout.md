# Hideout

**Модуль рецептов схрона (крафта) с актуальными ценами аукциона.**

## Общие сведения

- Рецепты один раз загружаются с CDN (`https://cdn.stalhub.dev/db/hideout_recipes.json`) и хранятся **в памяти** процесса (при сбое стартовой загрузки — одна повторная попытка через 60 с; последующие запросы пользуются общим in-flight промисом).
- Для каждого уникального ингредиента и результата берётся **минимальная цена выкупа** (min buyout) из истории аукциона EXBO по региону `RU` (`/auction/history`, `limit=20`, `additional=false`, через `auctionService` → общий axios-клиент с Redis-кэшем). Неудачные предметы ретраятся каждые 60 с, пока не резолвятся.
- Цены кэшируются в памяти (`inMemoryPrices`) и обновляются: при старте и по cron `hideout-update` в 00:00 и 12:00 по Москве. Снимок цен не переживает рестарт процесса.
- В ответе считается цена за единицу: сырая цена делится на количество предмета вниз (`Math.round`) у слотов с `amount > 1`; неизвестным предметам ставится `price: null`.

---

## `GET /api/v1/hideout`

Полный набор рецептов с прикреплёнными ценами.

### Тело ответа

```json
{
  "perks": [
    {
      "id": "…",
      "name": { "type": "…", "key": "…", "lines": { "type": "text", "text": "…" } },
      "desc": { "type": "…", "key": "…", "lines": { "type": "text", "text": "…" } }
    }
  ],
  "recipes": [
    {
      "bench": "…",
      "category": { "type": "…", "key": "…", "lines": { "type": "text", "text": "…" } },
      "subcategory": { "type": "…", "key": "…", "lines": { "type": "text", "text": "…" } },
      "result": [
        { "item": "…", "amount": 1, "price": 1200 }
      ],
      "ingredients": [
        { "item": "…", "amount": 3, "price": 400 }
      ],
      "energy": 5,
      "requirements": {
        "perks": { "armorer": 2, "engineering": 1 },
        "features": []
      }
    }
  ]
}
```

- `perks` — перки с локализованными названием и описанием (`name`/`desc`/`category`/`subcategory` — сообщения типа `text` или `translation` с `lines`).
- `result`/`ingredients` — предметы с количеством и ценой за единицу (`price: number | null`).
- `requirements.perks` — карта «перк → требуемый уровень» (поля `ammunition`, `armorer`, `pyrotechnics`, `engineering`, `materials`, `medicine`, `cooking`, `brewing`), `features` — прочие требования.

### Возможные ошибки

Нет (публичный эндпоинт); при сбое стартовой загрузки CDN первый запрос может вернуть ошибку вышестоящего источника.

---