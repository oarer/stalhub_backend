# Бэкапы — принцип работы

## Схема

Прод (`/var/www/stalhub_backend`) два раза в сутки пушит снапшоты
в **приватный** S3-бакет Beget через `restic`:

```
pg_dump -Fc + MANIFEST + [./uploads] + [.env.age] + логи
  → restic backup → s3://<бакет-бэкапов>/prod
  → restic forget --keep-last 60 --prune
```

Расписание — systemd-таймер `stalhub-backup.timer`: `00:05` и `12:05 MSK`
(`Persistent=true` — пропущенный прогон догоняется).
Ротация — последние 60 снапшотов (~30 дней). Размер репо — единицы ГБ.

## Как устроен прогон (`ops/backup/backup.sh`)

1. `flock` — второй экземпляр не стартует поверх первого.
2. `pg_dump -Fc --no-owner` из контейнера `StalHub_postgres` во временный каталог.
3. `MANIFEST.txt`: время, хост, git-rev, размеры, sha256 дампа.
4. `.env` шифруется через `age` (если задан `AGE_RECIPIENTS`) — секреты
   открытым текстом в снапшот не попадают.
5. `./uploads` добавляется, **только если каталог есть** (после переезда
   писателей на S3 его нет — скрипт молча пропускает).
6. Логи: каталог nginx целиком, дампы `docker logs --since 720h`
   (`StalHub_backend`, `image-service`, `discord-bot`), слепок self-лога.
   Если nginx-логи тяжелее `LOG_WARN_MB` (2 ГБ) — алерт, но прогон не валится.
7. `restic backup` → `forget --keep-last 60 --prune` → по воскресеньям `restic check`.
8. Метрики для node-exporter (`stalhub_backup_ok`,
   `stalhub_backup_last_success_unixtime`), лог — `/var/log/stalhub-backup.log`,
   провал — пост в Discord-webhook.

## Что внутри снапшота, а что нет

Входит: дамп БД, `MANIFEST.txt`, `uploads/` (пока локальны), `.env.age`, логи.
Не входит: `runtime/` (перестраиваемый кэш), `redis_data`, `grafana_data`,
docker-образы. Отдельный зазор: `/sc/`, `/maps/`, `/db/` живут на
StalHub-CDN-2 (другой хост) — restic их не видит; для них нужен отдельный
`rclone sync` на CDN-хосте либо признать восстанавливаемыми из исходников.

## Безопасность

Два разных бакета с разными ключами: `e8f5bf7796d2-stalhub-s3` — публичный
(только чтение: GET 200, PUT/LIST 403 без ключей), бакет бэкапов —
приватный (тумблер ВЫКЛ, анонимный доступ 403).
Поверх — шифрование самого репозитория (`RESTIC_PASSWORD` только
в `/root/.restic.env` на проде). Публичный тумблер — только на uploads,
на бэкапах — никогда.

## Uploads и S3

Хранилище — `src/lib/uploads.ts` на нативном `Bun.S3Client` (без AWS SDK).
Пути в БД стабильны (`/uploads/<key>`), ключ в бакете — `uploads/<key>`
(маппинг 1:1 с nginx). Флаг `S3_UPLOADS_ENABLED=false` — локальный
`./uploads` (dev и переходный период), `true` — запись/удаление/квота
идут в S3, чтение `/uploads/*` отдаёт 302 на бакет.
Имена файлов — UUID (неперечислимы), листинг бакета закрыт.
Раздача клиентам не меняется: `static.stalhub.dev/uploads/` (nginx на
StalHub-CDN-2, файл `cdn`) — при переезде там переключается только
`proxy_pass` с `api.stalhub.dev` на бакет; `Cache-Control: immutable`
на год ставит edge (Bun S3 per-object Cache-Control не выставляет).

## Восстановление

Без пройденного drill бэкап считается несделанным (гонять на dev-машине):

```bash
source /root/.restic.env
restic snapshots
restic restore latest --target /tmp/restore
pg_restore -d test_db --no-owner --clean /tmp/restore/tmp.*/stalhub-db.dump
cat /tmp/restore/tmp.*/MANIFEST.txt   # сверка sha256/размеров
```

Продовый restore БД — только с остановкой приложения.
Файлы — копированием `uploads/` (деплой их не трогает).
