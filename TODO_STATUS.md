# STALHUB TODO — Текущий статус

Обновлено: 2026-10-04
План: см. `TODO_PLAN.md`.

## Прогресс
| # | Фича | Бэк | Фронт | Коммит фронта | Статус |
|---|------|-----|-------|---------------|--------|
| 1 | Патч-ноуты (через статьи STALHUB) | ✅ тип-фильтр + автопубликация | ✅ /patch-notes + админ-форма + nav | `3fd58cf` | done |
| 2 | Сталкрафт-текст + градиенты | — | ✅ /calcs/text, `StalcraftText`, § + §#hex | `29dd0a5` | done |
| 3 | Арсенал: иконки + Магазин | ✅ icon из listing | ✅ колонка иконок, табы, shop 10/20/30k + обмены | `7da8750` | done |
| 4 | Творчество (арты): фильтры | ✅ sort newest/oldest/views/stars | ✅ кнопки сортировки | `8a02140` | done |
| 5 | Арты: табы + age-gate | — | ✅ Все/Обычные/NSFW, модалка при переходе | `8a02140` | done |
| 6 | Сборки: открытие по клику | — | ✅ клик по карточке → lite | `7bf795b` | done |
| 7 | Серверы: выбросы + пики | ✅ /peaks?days + /emissions?region (stalzone eapi) | ✅ блок выбросов RU/EU + таблица пиков 7/30D | `b21aac4` | done |
| 8 | Игроки: сводка | — | ✅ PlayerSummary: КД, PvP/PvE, КД сессий | `1c72eca` | done |
| 9 | Бартер: дерево + этапы | ✅ item_id в рецептах + GET /barter (список) | ✅ /calcs/barter, дерево до глубины 4, чекбоксы, итоги, localStorage | `5bafb7e` | done |
| 10 | Донат-калькулятор | ✅ GET /donate-calculator (price/coin, missing) | ✅ /calcs/donate, ввод монет, ранжирование | `a026fc4` | done |

## Замечания
- Донат: в БД нет 3 ID сезон-пропусков: `8AjTFOVB`, `cpe1d8xz`, `kJD59qaP` (untradable, has_market=false). Выводятся в блоке «Нет в БД».
- Арсенал Магазин: Fortis SHIFT взят чёрный `qjr43` (есть ещё оранжевый `knw1p`); Barska взят `knwdv` (дубль `j56d6`); VG6 взят `wjrjd` (556).
- Выбросы берутся с `https://eapi.stalzone.com/{REGION}/emission` через бэк-прокси.
- КД сессий считается по участникам operations (`mobKills/death`), PvE — сумма `mut-*` статов.
