#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/stalhub_backend}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/root/.restic.env}"
LOCK_FILE="/run/lock/stalhub-backup.lock"
LOG_FILE="${LOG_FILE:-/var/log/stalhub-backup.log}"
TEXTFILE_DIR="${TEXTFILE_DIR:-/var/lib/node_exporter}"

# shellcheck disable=SC1090
if [ -f "$RESTIC_ENV_FILE" ]; then
	set -a; source "$RESTIC_ENV_FILE"; set +a
fi

RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-${ADMIN_ALERT_WEBHOOK:-}}"
KEEP_LAST="${KEEP_LAST:-60}"

# --- Логи (фулл-бэкап) ---
BACKUP_LOGS="${BACKUP_LOGS:-1}"
NGINX_LOG_DIR="${NGINX_LOG_DIR:-/var/log/nginx}"
BACKUP_DOCKER_LOGS="${BACKUP_DOCKER_LOGS:-1}"
DOCKER_LOG_CONTAINERS="${DOCKER_LOG_CONTAINERS:-StalHub_backend StalHub_image_service StalHub_discord_bot}"
DOCKER_LOGS_SINCE="${DOCKER_LOGS_SINCE:-720h}" # 30 дней под ротацию
BACKUP_SELF_LOG="${BACKUP_SELF_LOG:-1}"
LOG_WARN_MB="${LOG_WARN_MB:-2048}"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"; }
alert() {
	local msg="$1"
	log "ALERT: $msg"
	[ -n "$ALERT_WEBHOOK_URL" ] || return 0
	curl -fsS -m 10 -H 'Content-Type: application/json' \
		-d "{\"content\": \"[backup] $msg\"}" \
		"$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
}
write_metrics() {
	# $1 = 1 ok / 0 fail
	[ -d "$TEXTFILE_DIR" ] || return 0
	cat >"$TEXTFILE_DIR/stalhub_backup.prom.$$" <<EOF
# HELP stalhub_backup_last_success_unixtime unixtime последнего успешного бэкапа
# TYPE stalhub_backup_last_success_unixtime gauge
stalhub_backup_last_success_unixtime $2
# HELP stalhub_backup_ok 1 если последний запуск успешен
# TYPE stalhub_backup_ok gauge
stalhub_backup_ok $1
EOF
	mv "$TEXTFILE_DIR/stalhub_backup.prom.$$" "$TEXTFILE_DIR/stalhub_backup.prom"
}

[ -n "$RESTIC_REPOSITORY" ] || { echo "RESTIC_REPOSITORY пуст (см. ops/backup/restic.env.example)" >&2; exit 2; }
[ -n "${RESTIC_PASSWORD:-}" ] || { echo "RESTIC_PASSWORD пуст" >&2; exit 2; }

exec 9>"$LOCK_FILE"
flock -n 9 || { log "уже запущен, выхожу"; exit 0; }

cd "$APP_DIR"
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_USER:?POSTGRES_USER нет в .env}"
: "${POSTGRES_DB:?POSTGRES_DB нет в .env}"

TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT
DUMP="$TMPDIR_WORK/stalhub-db.dump"
MANIFEST="$TMPDIR_WORK/MANIFEST.txt"

START_TS="$(date +%s)"
log "старт: app=$APP_DIR repo=$RESTIC_REPOSITORY"

if ! docker exec StalHub_postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
	alert "postgres не готов, бэкап пропущен"
	write_metrics 0 "$START_TS"
	exit 1
fi

log "pg_dump..."
PGPASSWORD="${POSTGRES_PASSWORD:-}" docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" StalHub_postgres \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner \
	>"$DUMP.tmp"
mv "$DUMP.tmp" "$DUMP"

if [ -d ./uploads ]; then
	HAVE_LOCAL_UPLOADS=1
	UPLOADS_SIZE="$(du -sh uploads 2>/dev/null | cut -f1)"
else
	HAVE_LOCAL_UPLOADS=0
	UPLOADS_SIZE="s3 (no local dir)"
	log "нет ./uploads — видимо писатели уже на S3, пропускаю"
fi

{
	echo "ts=$(date -u +%FT%TZ)"
	echo "host=$(hostname)"
	echo "git_rev=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
	echo "db_size=$(du -h "$DUMP" | cut -f1)"
	echo "uploads_size=${UPLOADS_SIZE:-unknown}"
	echo "dump_sha256=$(sha256sum "$DUMP" | cut -d' ' -f1)"
} >"$MANIFEST"

ENV_AGE="$TMPDIR_WORK/dotenv.age"
if command -v age >/dev/null 2>&1 && [ -n "${AGE_RECIPIENTS:-}" ]; then
	age -r $AGE_RECIPIENTS -o "$ENV_AGE" "$ENV_FILE"
	HAVE_ENV_AGE=1
else
	HAVE_ENV_AGE=0
	log "age/AGE_RECIPIENTS нет — .env не включаю в снапшот"
fi

BACKUP_ARGS=(
	--tag "manual=$( [ "${MANUAL:-0}" = 1 ] && echo yes || echo no )"
	"$DUMP" "$MANIFEST"
)
[ "${HAVE_LOCAL_UPLOADS:-0}" = 1 ] && BACKUP_ARGS+=(./uploads)
[ "$HAVE_ENV_AGE" = 1 ] && BACKUP_ARGS+=("$ENV_AGE")

if [ "$BACKUP_LOGS" = 1 ]; then
	if [ -d "$NGINX_LOG_DIR" ]; then
		log "nginx-логи: $NGINX_LOG_DIR"
		BACKUP_ARGS+=("$NGINX_LOG_DIR")
	else
		log "нет $NGINX_LOG_DIR — пропускаю (задай NGINX_LOG_DIR если путь другой)"
	fi

	if [ "$BACKUP_DOCKER_LOGS" = 1 ]; then
		mkdir -p "$TMPDIR_WORK/docker-logs"
		for c in $DOCKER_LOG_CONTAINERS; do
			if docker inspect "$c" >/dev/null 2>&1; then
				log "docker logs: $c (since $DOCKER_LOGS_SINCE)"
				docker logs --since "$DOCKER_LOGS_SINCE" "$c" >"$TMPDIR_WORK/docker-logs/$c.log" 2>&1 || log "не смог снять логи $c"
			else
				log "контейнера $c нет — пропускаю"
			fi
		done
		BACKUP_ARGS+=("$TMPDIR_WORK/docker-logs")
	fi

	if [ "$BACKUP_SELF_LOG" = 1 ] && [ -f "$LOG_FILE" ]; then
		cp "$LOG_FILE" "$TMPDIR_WORK/stalhub-backup.log.snapshot" 2>/dev/null || true
		BACKUP_ARGS+=("$TMPDIR_WORK/stalhub-backup.log.snapshot")
	fi

	LOGS_MB="$(du -sm "$NGINX_LOG_DIR" 2>/dev/null | cut -f1 || echo 0)"
	if [ "${LOGS_MB:-0}" -gt "$LOG_WARN_MB" ] 2>/dev/null; then
		alert "nginx-логи ${LOGS_MB}МБ > ${LOG_WARN_MB}МБ — проверь ротацию (logrotate) и квоту бакета"
	fi
	echo "logs_nginx_mb=${LOGS_MB:-0}" >>"$MANIFEST"
	echo "logs_docker=$(du -sh "$TMPDIR_WORK/docker-logs" 2>/dev/null | cut -f1)" >>"$MANIFEST"
fi

log "restic backup..."
if ! restic backup "${BACKUP_ARGS[@]}" >>"$LOG_FILE" 2>&1; then
	alert "restic backup FAILED (см. $LOG_FILE)"
	write_metrics 0 "$START_TS"
	exit 1
fi

log "forget --keep-last $KEEP_LAST --prune..."
restic forget --keep-last "$KEEP_LAST" --prune >>"$LOG_FILE" 2>&1 || log "forget вернул ошибку (не фатально)"

if [ "$(date +%u)" = 7 ]; then
	log "weekly check..."
	restic check >>"$LOG_FILE" 2>&1 || alert "restic check FAILED"
fi

END_TS="$(date +%s)"
log "готово за $((END_TS - START_TS))с, снапшоты:"
restic snapshots --compact >>"$LOG_FILE" 2>&1 || true
write_metrics 1 "$END_TS"
