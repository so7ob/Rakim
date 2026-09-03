#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$PROJECT_ROOT/.env"}
if [[ ! -f "$ENV_FILE" ]]; then echo "ملف البيئة غير موجود: $ENV_FILE" >&2; exit 1; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BACKUP_ROOT=${BACKUP_ROOT:-"${DATA_ROOT:?DATA_ROOT is required}/backups"}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_ROOT/$STAMP"
install -d -m 0700 "$TARGET"

export MYSQL_PWD=${DATABASE_PASSWORD:?DATABASE_PASSWORD is required}
mariadb-dump --host="${DATABASE_HOST:-127.0.0.1}" --port="${DATABASE_PORT:-3306}" \
  --user="${DATABASE_USER:?DATABASE_USER is required}" --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 "${DATABASE_NAME:?DATABASE_NAME is required}" > "$TARGET/database.sql"
unset MYSQL_PWD

if [[ -d "$DATA_ROOT/sources" ]]; then tar -C "$DATA_ROOT" -czf "$TARGET/sources.tar.gz" sources; fi
sha256sum "$TARGET"/* > "$TARGET/SHA256SUMS"
printf '{"createdAt":"%s","database":"%s","formatVersion":1}\n' "$STAMP" "$DATABASE_NAME" > "$TARGET/manifest.json"
echo "اكتملت النسخة الاحتياطية: $TARGET"

