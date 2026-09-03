#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$PROJECT_ROOT/.env"}
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BACKUP_ROOT=${BACKUP_ROOT:-"${DATA_ROOT:?DATA_ROOT is required}/backups"}
BACKUP_DIR=${1:-$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%p\n' | sort | tail -1)}
if [[ -z "$BACKUP_DIR" || ! -f "$BACKUP_DIR/database.sql" ]]; then echo "لا توجد نسخة صالحة للاختبار." >&2; exit 1; fi
CHECK_DB="${DATABASE_NAME}_restore_check_$$"
if [[ ! "$CHECK_DB" =~ ^[A-Za-z0-9_]+$ ]]; then echo "اسم قاعدة الاختبار غير آمن." >&2; exit 1; fi
cleanup(){ mariadb -uroot -e "DROP DATABASE IF EXISTS \`$CHECK_DB\`" >/dev/null 2>&1 || true; }
trap cleanup EXIT

(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)
mariadb -uroot -e "CREATE DATABASE \`$CHECK_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mariadb -uroot "$CHECK_DB" < "$BACKUP_DIR/database.sql"
COUNTS=$(mariadb -N -uroot "$CHECK_DB" -e "SELECT CONCAT((SELECT COUNT(*) FROM legislations),' legislations; ',(SELECT COUNT(*) FROM article_versions),' article versions; ',(SELECT COUNT(*) FROM source_documents),' sources')")
TMP_DIR=$(mktemp -d)
if [[ -f "$BACKUP_DIR/sources.tar.gz" ]]; then tar -tzf "$BACKUP_DIR/sources.tar.gz" >/dev/null; tar -xzf "$BACKUP_DIR/sources.tar.gz" -C "$TMP_DIR"; fi
rm -r "$TMP_DIR"
echo "نجح اختبار الاستعادة المعزول: $COUNTS"

