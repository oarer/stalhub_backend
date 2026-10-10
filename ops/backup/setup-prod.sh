#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/stalhub_backend}"

apt-get update -y
apt-get install -y restic postgresql-client age curl

mkdir -p /opt/stalhub-backup
cp "$APP_DIR/ops/backup/backup.sh" /opt/stalhub-backup/backup.sh
chmod 750 /opt/stalhub-backup/backup.sh

cp "$APP_DIR/ops/backup/stalhub-backup.service" /etc/systemd/system/
cp "$APP_DIR/ops/backup/stalhub-backup.timer" /etc/systemd/system/
systemctl daemon-reload

echo "далее: source /root/.restic.env && restic init && MANUAL=1 /opt/stalhub-backup/backup.sh && systemctl enable --now stalhub-backup.timer"
