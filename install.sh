#!/usr/bin/env bash
set -Eeuo pipefail

# One-command installer. It writes generated secrets to the local,
# Git-ignored .env.production file; the administrator is created in /install.
REPO_URL="${XINYUE_REPO:-https://github.com/qiantingwl/xinyueai.git}"
APP_DIR="${XINYUE_DIR:-xinyueai}"
die() { printf '安装失败：%s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || die '未找到 Docker，请先安装 Docker Engine 24+ 和 Compose v2。'
docker compose version >/dev/null 2>&1 || die '未找到 Docker Compose v2。'

if [[ ! -f docker-compose.prod.yml ]]; then
  command -v git >/dev/null 2>&1 || die '当前目录不是项目目录，且未找到 git。'
  if [[ -f "$APP_DIR/docker-compose.prod.yml" ]]; then
    cd "$APP_DIR"
  else
    [[ -e "$APP_DIR" ]] && die "目标目录已存在但不是 Xinyue AI 项目：$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi
fi

[[ -f .env.production.example ]] || die '缺少 .env.production.example。'
if [[ ! -f .env.production ]]; then
  cp .env.production.example .env.production
fi

random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; fi
}
escape_sed() { printf '%s' "$1" | sed 's/[\\&|]/\\&/g'; }
set_env() {
  key="$1"; value="$2"; escaped=$(escape_sed "$value")
  if grep -qE "^${key}=" .env.production; then
    sed -i.bak "s|^${key}=.*|${key}=${escaped}|" .env.production
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env.production
  fi
}
set_env_if_missing() {
  key="$1"; value="$2"
  current=$(grep -E "^${key}=" .env.production | head -n 1 | cut -d= -f2- || true)
  if [[ -z "$current" || "$current" == replace-with* ]]; then set_env "$key" "$value"; fi
}

# A previous curl|bash release could accidentally write the shell source into
# ADMIN_EMAIL when stdin was not attached to /dev/tty. Clear that malformed
# value so the browser wizard can be used on the next run.
existing_admin_email=$(grep -E '^ADMIN_EMAIL=' .env.production | head -n 1 | cut -d= -f2- || true)
if [[ -n "$existing_admin_email" && ! "$existing_admin_email" =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]]; then
  set_env ADMIN_EMAIL ''
  set_env ADMIN_PASSWORD ''
fi

set_env_if_missing POSTGRES_PASSWORD "$(random_secret)"
set_env_if_missing SESSION_SECRET "$(random_secret)"
set_env_if_missing CREDENTIAL_ENCRYPTION_KEY "$(random_secret)"
set_env_if_missing NODE_ENV production
set_env_if_missing XINYUE_HTTP_PORT "${XINYUE_HTTP_PORT:-8080}"

port_in_use() {
  port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  else
    docker ps --format '{{.Ports}}' | grep -Eq "(0\.0\.0\.0|:::):${port}->"
  fi
}

http_port=$(grep -E '^XINYUE_HTTP_PORT=' .env.production | head -n 1 | cut -d= -f2- || true)
[[ "$http_port" =~ ^[0-9]+$ ]] && (( http_port >= 1 && http_port <= 65535 )) || die 'XINYUE_HTTP_PORT 必须是 1-65535 的端口号。'
frontend_running=$(docker compose --env-file .env.production -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -x 'frontend' || true)
if [[ -z "$frontend_running" ]] && port_in_use "$http_port"; then
  original_port="$http_port"
  while port_in_use "$http_port"; do
    ((http_port += 1))
    (( http_port <= 65535 )) || die '未找到可用的 Web 端口。'
  done
  set_env XINYUE_HTTP_PORT "$http_port"
  printf '端口 %s 已被占用，已自动改用 %s。\n' "$original_port" "$http_port"
fi
chmod 600 .env.production 2>/dev/null || true
rm -f .env.production.bak

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
printf '\nXinyue AI 已安装，访问地址：http://服务器IP:%s/\n' "$http_port"
printf '首次启动请打开：http://服务器IP:%s/install\n' "$http_port"
printf '启用 HTTPS 后请将 WEB_ORIGIN 改为 https://域名，并设置 COOKIE_SECURE=true。\n'
