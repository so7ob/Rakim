#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${ENV_FILE:-"$PROJECT_ROOT/.env"}
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ "${DATABASE_NAME:-}" =~ ^[A-Za-z0-9_]+$ ]] || { echo "DATABASE_NAME غير صالح" >&2; exit 1; }
[[ "${DATABASE_USER:-}" =~ ^[A-Za-z0-9_]+$ ]] || { echo "DATABASE_USER غير صالح" >&2; exit 1; }
PASSWORD_SQL=${DATABASE_PASSWORD//\'/\'\'}
mariadb -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DATABASE_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DATABASE_USER'@'127.0.0.1' IDENTIFIED BY '$PASSWORD_SQL';
ALTER USER '$DATABASE_USER'@'127.0.0.1' IDENTIFIED BY '$PASSWORD_SQL';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,DROP,REFERENCES,TRIGGER ON \`$DATABASE_NAME\`.* TO '$DATABASE_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
echo "قاعدة MariaDB ومستخدم التطبيق جاهزان."

