# План: StalZone Awards — голосование «Премия года» (несколько категорий)

## Контекст

Админ создаёт кампанию премии StalZone Awards с категориями и списком номинантов. Номинант — не пользователь сайта: админ вручную заполняет его профиль (аватар, ссылки на соцсети, ник). Голосовать могут **только пользователи с привязанным EXBO-аккаунтом**; голос отдаётся один раз в каждой категории и **изменить его нельзя**. По дедлайну крон только закрывает приём голосов; итоги подтверждает и публикует админ — до этого юзеры не видят количество голосов. Ничьи разрешаются вручную админом; при неразрешённой ничьей публикация итогов блокируется.

Что уже есть:

- RBAC: permission-модель `User → Role → Permission`, `requirePermission` / `requireAdmin` (= `user:manage`) в `src/utils/auth.guard.ts:29-160`. Админ-группа роутов `src/app/api/admin/` с паттерном `index.ts` + `*.service.ts`. Роль owner — `Role.name === 'owner'` (см. `src/app/api/commissions/data.ts:55`).
- Auth providers: EXBO OAuth (`src/app/api/auth/providers/exbo/`), связь `User.exbo_auth` (`EXBOAuth`, `prisma/schema.prisma:425`), `User.id` — `Int`.
- Uploads: `src/lib/uploads.ts` (FS/S3, `putUpload`/`deleteUpload`), раздача `/uploads/*` в `src/index.ts:85-157`; папка `uploads/users/` — для аватарок.
- PNG-шаблоны на фронте: React-шаблон + `html-to-image` (`toBlob`/`toPng`) + `getFontEmbedCss` (`src/lib/font-embed.ts`). Эталон — `src/views/calcs/builds/lite/components/BuildLitePngTemplate.tsx`, хуки `useTierListPng` / `useUnoSeasonTiersPng` / `useClanSquadPng`. Шрифты — `unbounded` + MTS из `src/app/fonts.ts`, фон `#111318`, размер шаблона по контенту (`w-7xl`), `pixelRatio: 2`.
- Rate limiting/auto-ban глобальный (`src/index.ts`).
- Уведомления: `Notifications` (+ WS-событие `notification`, см. plans/dm.md) — для анонса старта голосования и публикации результатов.
- Аудит админки: `AdminAuditLog` (`prisma/schema.prisma:1328`) + `logAdminAction` (`src/lib/admin-audit.ts`).
- Фронт: React Query (`src/queries/**`), страницы в `src/app/(public)/`, локали `src/locales/*.json` (5 шт., русский основной).

## Часть 1. Модель данных

Миграция `prisma/migrations/YYYYMMDDHHMMSS_add_awards`:

```prisma
enum AwardStatus {
  draft
  voting
  ended
  published
}

model AwardCampaign {
  id        String      @id @default(cuid())
  year      Int         @unique        // премия года — одна кампания на год
  title     String      @default("StalZone Awards")
  status    AwardStatus @default(draft)
  ends_at   DateTime?   // дедлайн приёма голосов (в БД UTC)
  voting_closed_at     DateTime?
  results_published_at DateTime?
  results_snapshot     Json?     // зафиксированные итоги на момент published
  categories AwardCategory[]
  @@map("award_campaigns")
}

model AwardCategory {
  id          String @id @default(cuid())
  campaign_id String
  slug        String        // для быстрых ссылок: /awards/{year}/{slug}
  title_i18n       Json     // { ru, en, ... } — все 5 локалей
  description_i18n Json?    // { ru, en, ... }
  position    Int    @default(0)
  campaign    AwardCampaign @relation(...)
  nominees    AwardNominee[]
  votes       AwardVote[]
  @@unique([campaign_id, slug])
  @@index([campaign_id, position])
  @@map("award_categories")
}

model AwardNominee {
  id           String  @id @default(cuid())
  category_id  String
  name         String       // ник, не переводится
  avatar_url   String?
  social_links Json?        // [{ label, url }]
  description_i18n Json?    // { ru, en, ... }
  position     Int          @default(0)
  manual_place Int?         // ручное место при ничьей; задаёт админ
  category     AwardCategory @relation(...)
  votes        AwardVote[]

  @@index([category_id, position])
  @@map("award_nominees")
}

model AwardVote {
  id          String @id @default(cuid())
  category_id String
  user_id     Int
  nominee_id  String
  created_at  DateTime @default(now())

  excluded_at    DateTime?   // аннулирован админом
  excluded_by    Int?
  exclude_reason String?

  user     User          @relation(fields: [user_id], references: [id], onDelete: Cascade)
  category AwardCategory @relation(fields: [category_id], references: [id])
  nominee  AwardNominee  @relation(fields: [nominee_id], references: [id])

  @@unique([category_id, user_id])   // один неизменяемый голос юзера в категории
  @@index([nominee_id])
  @@index([created_at])
  @@index([category_id, excluded_at])
  @@map("award_votes")
}
```

Примечания:
- голос **неизменяем**: `updated_at`/upsert/переголосование/отзыв юзером не предусмотрены. Повторный запрос = `409 Conflict` (в том числе при сетевом ретрае).
- уникальный ключ `[category_id, user_id]` защищает от гонок на уровне БД.
- номинант привязан к категории; если один человек номинирован в нескольких категориях — отдельные записи.
- `slug` генерируется транслитом из `title_i18n.ru`, при коллизии — суффикс `-2`, `-3`; можно переопределить вручную. После `published` slug не меняется. Резервные слова (`vote`, `results`, `nominees` и т.п.) запрещены.
- `AwardVote.user_id → User.id` (`Int`), `onDelete: Cascade`: при удалении юзера голос удаляется и в подсчёт не попадает. После `published` итоги читаются из `results_snapshot`, поэтому удаление юзера не меняет уже опубликованные результаты.
- админ может аннулировать голос (`excluded_at`), запись остаётся в БД для аудита; аннулированные голоса не учитываются в подсчёте и снапшоте. Действие логируется в `AdminAuditLog`.
- `manual_place` заполняется админом при ничьей (и при необходимости ручной расстановки); имеет приоритет над расчётом по голосам.
- `title_i18n`/`description_i18n`/`description_i18n` — объекты со всеми 5 локалями проекта; API отдаёт нужную локаль с fallback на `ru`.
- все даты храним в UTC; ввод/вывод для админа — в UTC+3. В `ended`/`published` менять `ends_at` нельзя.

## Часть 2. Бэкенд — админ

`src/app/api/admin/awards/` (`index.ts` + `awards.service.ts`), всё за `requirePermission('awards:manage')`.

- `GET /api/v1/admin/awards` — кампании со вложенными категориями/номинантами.
- `POST /api/v1/admin/awards` — создать кампанию `{ year, title? }`.
- `PATCH /api/v1/admin/awards/:id` — `{ title, status, ends_at }`. Переходы: `draft → voting → ended → published`.
  - `voting → ended` — закрытие **приёма голосов** (по дедлайну через cron или вручную). Результаты юзерам не показываем.
  - `ended → published` — админ подтвердил завершение и опубликовал итоги. Публикация **блокируется**, если есть неразрешённая ничья, влияющая на 1-е место или границу топ-3: админ должен выставить `manual_place`.
  - `ended → voting` (откат) — разрешён: сбрасываем `voting_closed_at`, снова включаем крон, повторно шлём уведомление о старте голосования.
  - `published → *` запрещён. После `published` полный фриз: любые изменения (контент, места, голоса, даты) доступны **только роли owner** (`Role.name === 'owner'`) и пишутся в `AdminAuditLog`.
  - `ends_at` нельзя ставить в прошлое; для `ended`/`published` даты неизменяемы.
- `POST /api/v1/admin/awards/:campaignId/categories` / `PATCH .../categories/:id` / `DELETE ...` — CRUD категорий (`slug` автогенерируется, можно переопределить; `title_i18n`/`description_i18n` — все 5 локалей). Удаление категории каскадно удаляет номинантов, их голоса и аватарки, только до `published` (после — owner).
- CRUD номинантов: `POST/PATCH/DELETE /api/v1/admin/awards/:campaignId/categories/:categoryId/nominees/:id?`. Удаление номинанта — каскад с голосами, аватарка удаляется из хранилища.
- Аватарка номинанта: `POST /api/v1/admin/awards/nominees/avatar` (multipart, `t.File`) — сжатие/resize как у аватарок юзеров (`src/app/api/users/avatar.ts`), сохранение в `uploads/users/awards/`, ответ `{ url }`. Валидация mime по фактическим байтам; при замене/удалении старый файл удаляем.
- Разрешение ничьих: `PATCH /api/v1/admin/awards/:id/categories/:categoryId/nominees/:nomineeId/place` — `{ manual_place: number | null, note? }`. `null` — сбросить ручное место.
- Аннулирование голоса: `PATCH /api/v1/admin/awards/:id/votes/:voteId` — `{ excluded: boolean, reason? }` (мягкое исключение, без физического удаления).

### Отслеживание голосов (админка)

- `GET /api/v1/admin/awards/:id/votes` — список голосов с пагинацией `before`/`after`, фильтры `category_id`, `nominee_id`, `user_id`, `excluded`, диапазон дат. Отдаём `{ id, user: { id, username }, category_id, nominee_id, created_at, excluded_at, exclude_reason }`.
- `GET /api/v1/admin/awards/:id/stats` — всего голосов, по категориям, по номинантам, **проценты** и динамика по часам/дням, доля проголосовавших от всех EXBO-юзеров.
- `GET /api/v1/admin/awards/:id/results` — счётчики, проценты, места по номинантам в любой момент; ничьи помечаются.
- Live-обновление: при новом голосе публиковать событие (`award.vote`) в админ-комнату WS (если WS-слой из plans/dm.md уже есть) либо polling с фронта. REST — источник истины.
- Количество голосов видят **только админы** в любом статусе. Юзеры — только после `published`. Крон лишь закрывает приём голосов и **не** раскрывает результаты.

### Подведение итогов

- Публикация (`ended → published`) фиксирует `results_snapshot` с местами/голосами/победителями по всем категориям (с учётом `manual_place` и исключённых голосов). Публичные эндпоинты читают снапшот.
- При ничьей, влияющей на 1-е место или границу топ-3, публикация невозможна, пока админ не расставит места вручную.
- Админ видит проценты и общее число голосов; после публикации изменение снапшота доступно только owner.

## Часть 3. Бэкенд — публичное API

`src/app/api/awards/` (`index.ts` + `awards.service.ts`), подключить в `src/app/api/index.ts`.

- `GET /api/v1/awards` — **последняя** кампания (max `year`), публичная: `{ year, title, status, ends_at, can_vote, vote_block_reason, categories: [{ id, slug, title, description, my_vote_nominee_id, nominees: [...] }] }`.
  - `draft` — 404. Если последняя кампания `draft`, отдаём 404 (не показываем прошлогоднюю).
  - `can_vote` — общий флаг для текущего юзера; `vote_block_reason` — код: `not_authenticated` | `not_exbo` | `not_voting` | `ended`. Уже отданный голос виден через `my_vote_nominee_id` в категории.
  - В `voting` и `ended` — **без** `votes_count`/`place` (явные `select`, счётчики не подмешиваются). В `published` — результаты из снапшота.
- `GET /api/v1/awards/:year/:slug` — кампания/категория по быстрой ссылке (для `?nominee=` — фокус на номинанте). `year` — числовой параметр; статические роуты (`/results`, `/vote`) регистрируются раньше/не конфликтуют.
- `POST /api/v1/awards/vote` — `{ category_id, nominee_id }` за `requireAuth` **и проверкой EXBO-аккаунта на момент голосования**:
  - юзер должен иметь `exbo_auth`; иначе `403` «голосование доступно только через EXBO». Привязка EXBO после регистрации допускается; отвязка EXBO после голосования голос **не** удаляет.
  - кампания в статусе `voting` и `ends_at` не прошёл;
  - номинант принадлежит категории; юзер не забанен (`requireAuth` уже проверяет);
  - повторный голос в категории (в т.ч. при ретрае) — `409 Conflict`;
  - проверки «голос за себя» **нет**;
  - защита от гонок: ловим `P2002` по `[category_id, user_id]` и отдаём `409`.
- `GET /api/v1/awards/results` — только при `status = published`: `{ categories: [{ id, slug, title, nominees: [{ id, name, avatar_url, votes_count, place }], winner_ids: [] }] }` из `results_snapshot`. При ничьей за первое место — все победители, но при публикации ничьи уже разрешены вручную.

### Карточки для агитации

Генератор «как в калькуляторе сборок»: полностью на фронте, без серверного рендера. Переиспользуем существующий пайплайн PNG-шаблонов и ассеты (шрифты, цвета, `stalhub.dev`-хедер).

- Новый шаблон `src/views/awards/components/AwardPngTemplate.tsx` по образцу `BuildLitePngTemplate.tsx`: `dark`, `bg-background`, `bg-card`, `text-primary`, акцент — текущий акцентный цвет сайта; хедер `stalhub.dev` шрифтом `unbounded`; шрифты MTS из `src/app/fonts.ts`.
- Хук `src/views/awards/hooks/useAwardPng.ts` по образцу `useTierListPng`/`useClanSquadPng`:
  - `document.fonts.ready`, `getFontEmbedCss(node)`, `toBlob(node, { backgroundColor: '#111318', pixelRatio: 2, fontEmbedCSS })`;
  - аватар номинанта и иконки соцсетей сначала inline'ятся в data URL (`imageToDataUrl`) — как в билд-калькуляторе;
  - fallback без аватарки — плейсхолдер.
- Содержимое:
  - до публикации итогов: аватар, номинация (локализованная), `Голосуй за {ник}`, логотип/название **StalZone Awards**, ссылка на StalHub;
  - после `published`: копирайт меняется на результат — `{ник} — победитель StalZone Awards`, `{N} место` или `Финалист` (по месту из снапшота), плюс количество голосов.
- Ссылка строится от `WEB_ORIGIN` (`src/env.ts:71`), не хардкодится. QR **не делаем**.
- Серверный эндпоинт и Redis-кэш не нужны: картинка генерируется в браузере и скачивается/шарится (Web Share API где доступно). Кэш — браузерный, по факту повторной генерации.
- Доступность: на публичной странице — в `voting`/`ended`/`published`; в админке — в любом статусе, включая `draft` (защищено админ-роутом).
- Быстрые ссылки для каждой номинации: `/{locale}/awards/{year}/{slug}` (+ `?nominee=...` для генератора) — печатаем на карточке и отдаём в API.

Авто-закрытие приёма голосов: cron (`@elysia/cron`, см. `src/crons.ts`) раз в час переводит кампании с истёкшим `ends_at` из `voting` в `ended` (`voting_closed_at = now()`, conditional update `where status = voting`) и шлёт уведомление «голосование завершено, ждите итогов». Крон **не публикует** результаты и не раскрывает счётчики.

### Публичная выдача результатов (по категориям)

После публикации итогов внутри каждой номинации — три вкладки:

1. **«Остальные места»** — все, кто занял места ниже топ-3, сразу списком, с местом и количеством голосов. Сортировка по голосам; при равных голосах — одинаковое место.
2. **«Топ-3»** — три карточки, изначально в случайном порядке. Раскрытие с конца: сначала 3-е место, затем 2-е, затем 1-е.
3. **«Победитель»** — по кнопке победитель «переезжает» в центр, обводится акцентным цветом сайта, летит конфетти, под карточкой — количество голосов.

- Ничьи к моменту публикации уже разрешены админом (`manual_place`); если нет — публикация не состоялась.
- 0 голосов: показываем пустое состояние, победителя нет. Меньше 3 номинантов: вкладка топ-3 показывает сколько есть.
- `prefers-reduced-motion`: без конфетти и перелётов, только подсветка/появление.
- Повторное открытие категории не должно проигрывать анимацию бесконечно: `localStorage` + кнопка «повторить».
- Мобильный вариант: карточки в колонку, победитель в центре экрана.

## Часть 4. Фронтенд

- Типы/сервис/queries: `src/types/awards.type.ts`, `src/services/awards/awards.service.ts`, `src/queries/awards/awards.queries.ts`.
- Публичная страница `src/app/(public)/awards/page.tsx` + view `src/views/awards/`:
  - заголовок **StalZone Awards**, год, таймер до конца голосования (по `ends_at`, UTC+3; использовать серверное время);
  - категории — табы/секции; выбранная категория синхронизируется с URL (`/{locale}/awards/{year}/{slug}`) — это и есть быстрая ссылка;
  - карточка номинанта: аватар, ник, локализованное описание, иконки соцсетей (Iconify), кнопка «Голосовать»; **confirm-диалог** перед отправкой (голос необратим); после голоса — «голос отдан», изменить нельзя; не-EXBO юзерам кнопка недоступна с объяснением, как привязать EXBO;
  - в `ended` — «голосование завершено, итоги подтверждаются», счётчиков и мест нет;
  - в `published` — «Итоги»: вкладки «Остальные места», «Топ-3», «Победитель» (см. выше).
- Генератор карточек (клиентский, по образцу `BuildLitePngTemplate`): диалог/страница «Сделать картинку» — выбор категории и номинанта, выбор локали, превью через `html-to-image`, «Скачать» / «Поделиться» (Web Share API где доступно). Публично в `voting`/`ended`/`published`, в `draft` — из админки.
- Админка: `src/app/admin/awards/page.tsx` + view `src/views/admin/awards/`:
  - управление кампанией: дедлайн (UTC+3), «открыть голосование» (`voting`), «закрыть приём голосов» (`ended`), «подтвердить и опубликовать итоги» (`published`); публикация блокируется при неразрешённых ничьих;
  - CRUD категорий (все локали, slug) и номинантов, загрузка/замена/удаление аватарки, редактируемые соцсети;
  - «Голоса»: таблица с фильтрами (категория, номинант, юзер, дата, аннулированные), пагинация, проценты, авто-обновление (WS/polling), кнопка аннулирования голоса;
  - «Итоги»: счётчики, проценты, общее число голосов, ручная расстановка мест при ничьих, публикация;
  - после `published` — режим только для owner (изменения с аудитом).
- Анонсы: при `draft → voting`, `voting → ended`, `ended → published` (и повторно при откате `ended → voting`) — глобальное уведомление **для всех** через `src/app/api/admin/notifications/` (+ WS `notification`), с локализацией и ссылкой на премию.
- Локализация: ключи `awards.*` во всех 5 локалях; контент категорий/номинантов — во всех 5 локалях; бренд «StalZone Awards» не переводится.

## Часть 5. Документация и тесты

- `docs/awards.md` в стиле остальных доков.
- Тесты в `tests/`:
  - CRUD кампании/категорий/номинантов (права), permission `awards:manage`;
  - голос только с EXBO-аккаунтом; привязка EXBO после регистрации; отвязка после голоса не удаляет голос;
  - голосование в `draft`/`ended` и после `ends_at` = ошибка; номинант чужой категории = ошибка;
  - повторный голос и ретрай = `409`, счётчики не меняются; отсутствие проверки «за себя»;
  - аннулирование голоса админом исключает его из подсчёта и снапшота, запись остаётся;
  - удаление юзера каскадно удаляет голос до публикации; после `published` снапшот не меняется;
  - скрытие счётчиков до `published` (явные `select`), публикация только админом; блуждающие ничьи блокируют публикацию до `manual_place`;
  - ручные места, проценты, общее число голосов; сортировка ниже топ-3 по голосам;
  - cron: `voting → ended`, не публикует, идемпотентен; откат `ended → voting` сбрасывает `voting_closed_at`;
  - фриз после `published` и доступ только owner; неизменяемость дат в `ended`/`published`;
  - локали: все 5 ключей в категориях/номинантах, fallback на `ru`;
  - slug: транслит, коллизии, резервные слова, неизменяемость после публикации;
  - карточки: e2e/фронт — шаблон рендерится и скачивается в `voting`/`ended`/`published`, из админки — в `draft`; разные копирайты до/после итогов; inline аватарок; fallback без аватарки.

## Порядок работ

1. Миграция + админ-API + permission `awards:manage` + owner-фриз.
2. Публичное API (последняя кампания, голосование с EXBO-проверкой, быстрые ссылки).
3. Публичная страница и голосование (неизменяемый голос, confirm).
4. Админка (CRUD, аватарки, статусы, отслеживание/аннулирование голосов, проценты).
5. Итоги: ничьи через `manual_place`, снапшот, публикация.
6. Генератор карточек (клиентский PNG-шаблон на общих ассетах, до/после итогов).
7. Уведомления, локализация, доки, тесты.

## Допущения и открытые вопросы

- Голос — один на пользователя **в каждой категории**, изменять/отзывать нельзя. Повторный запрос всегда `409`.
- Голосовать могут только юзеры с привязанным EXBO-аккаунтом на момент голосования; отвязка EXBO после голоса его не отменяет.
- Дедлайн: админ задаёт дату (UTC+3, в БД UTC, прошлое запрещено); cron закрывает только приём голосов (`voting → ended`). Итоги подтверждает и публикует админ (`ended → published`).
- Количество голосов обычным юзерам не показывается ни в `voting`, ни в `ended`; админ видит всегда.
- Проверки «голос за себя» нет.
- Ничьи разрешаются вручную админом; при неразрешённой ничьей (1-е место или граница топ-3) публикация блокируется.
- После `published` полный фриз, изменения только ролью owner с записью в `AdminAuditLog`.
- Удаление юзера каскадно удаляет его голос; опубликованные итоги читаются из `results_snapshot` и не меняются.
- Карточки генерируются на клиенте через `html-to-image` на тех же ассетах, что и остальные PNG-шаблоны (`BuildLitePngTemplate`, шрифты `unbounded`/MTS, `#111318`, акцент сайта); QR не делаем. Публично доступны в `voting`/`ended`/`published`, в `draft` — только из админки.
- Публичного анонса/статуса `announced` нет: в `draft` страница и генератор закрыты для обычных юзеров, карточки в `draft` делает только админ. Публично генератор доступен начиная с `voting`.
- Дизайн карточек — на общих ассетах остальных PNG-шаблонов (см. `BuildLitePngTemplate`): `w-7xl`, `pixelRatio: 2`, фон `#111318`, шрифты `unbounded`/MTS, акцент сайта; длинные ники обрезаются как в билд-калькуляторе, без аватарки — плейсхолдер.
- Название премии — **StalZone Awards** (константа бренда).
