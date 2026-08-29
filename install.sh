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

set_env_if_missing POSTGRES_PASSWORD "$(random_secret)"
set_env_if_missing SESSION_SECRET "$(random_secret)"
set_env_if_missing CREDENTIAL_ENCRYPTION_KEY "$(random_secret)"
set_env_if_missing NODE_ENV production
chmod 600 .env.production 2>/dev/null || true
rm -f .env.production.bak

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
printf '\nXinyue AI 已安装。启用 HTTPS 后请将 WEB_ORIGIN 改为 https://域名，并设置 COOKIE_SECURE=true。\n'
