#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
cleanup() { rm -r "$TEST_ROOT"; }
trap cleanup EXIT

cat >"$TEST_ROOT/nginx.conf" <<EOF
worker_processes 1;
pid $TEST_ROOT/nginx.pid;
error_log stderr;
events { worker_connections 64; }
http {
  access_log off;
  include /etc/nginx/mime.types;
  include $PROJECT_ROOT/infra/nginx/yemen-legislation.conf;
}
EOF

nginx -t -p / -c "$TEST_ROOT/nginx.conf"
systemd-analyze verify \
  "$PROJECT_ROOT/infra/systemd/yemen-legislation-api.service" \
  "$PROJECT_ROOT/infra/systemd/yemen-legislation-worker.service"
echo "نجح التحقق من Nginx وsystemd."
