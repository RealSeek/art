#!/usr/bin/env bash
set -Eeuo pipefail

# One-command installer. Credentials are entered by the operator and stored
# only in the local, Git-ignored .env.production file.
REPO_URL="${XINYUE_REPO:-https://github.com/qiantingwl/xinyueai.git}"
APP_DIR="${XINYUE_DIR:-xinyueai}"
die() { printf '安装失败：%s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || die '未找到 Docker，请先安装 Docker Engine 24+ 和 Compose v2。'
docker compose version >/dev/null 2>&1 || die '未找到 Docker Compose v2。'

if [[ ! -f docker-compose.prod.yml ]]; then
  command -v git >/dev/null 2>&1 || die '当前目录不是项目目录，且未找到 git。'
  [[ -e "$APP_DIR" ]] && die "目标目录已存在：$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

[[ -f .env.production.example ]] || die '缺少 .env.production.example。'
if [[ -f .env.production ]]; then
  printf '.env.production 已存在，是否保留并继续？[y/N] '
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]] || die '已取消，未覆盖现有配置。'
else
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

printf 'Xinyue AI 首次部署配置\n管理员邮箱 [admin@example.com]: '
read -r admin_email
admin_email="${admin_email:-admin@example.com}"
while :; do
  printf '管理员密码（至少 8 位，不会显示）: '
  read -r -s admin_password; printf '\n'
  [[ ${#admin_password} -ge 8 ]] && break
  printf '密码长度不足 8 位，请重试。\n'
done

set_env POSTGRES_PASSWORD "$(random_secret)"
set_env SESSION_SECRET "$(random_secret)"
set_env CREDENTIAL_ENCRYPTION_KEY "$(random_secret)"
set_env ADMIN_EMAIL "$admin_email"
set_env ADMIN_PASSWORD "$admin_password"
set_env NODE_ENV production
chmod 600 .env.production 2>/dev/null || true
rm -f .env.production.bak

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
printf '\nXinyue AI 已安装。启用 HTTPS 后请将 WEB_ORIGIN 改为 https://域名，并设置 COOKIE_SECURE=true。\n'
