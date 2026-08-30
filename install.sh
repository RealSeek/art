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
  if [[ -z "$current" || "$current" =~ (replace-with|change-me|changeme|example|dev_password|default-password|your[_-]|flux[_-]?dev|xinyue[_-]?(rc|dev|test)|local[_-]?only|staging|test[_-]?(secret|password)) ]]; then
    set_env "$key" "$value"
  fi
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
set_env_if_missing INSTALL_TOKEN "${XINYUE_INSTALL_TOKEN:-$(random_secret)}"
set_env_if_missing LOCAL_WORKER_TOKEN "$(random_secret)"
set_env_if_missing NODE_ENV production
set_env_if_missing XINYUE_HTTP_BIND 127.0.0.1
if [[ -n "${XINYUE_HTTP_PORT:-}" ]]; then
  # An explicit shell override must also be persisted so Compose and the
  # address printed below use the same host port.
  set_env XINYUE_HTTP_PORT "$XINYUE_HTTP_PORT"
else
  set_env_if_missing XINYUE_HTTP_PORT 8080
fi

port_in_use() {
  port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  else
    docker ps --format '{{.Ports}}' | grep -Eq "(0\.0\.0\.0|127\.0\.0\.1|:::|\[::\]):${port}->"
  fi
}

http_port=$(grep -E '^XINYUE_HTTP_PORT=' .env.production | head -n 1 | cut -d= -f2- || true)
http_bind=$(grep -E '^XINYUE_HTTP_BIND=' .env.production | head -n 1 | cut -d= -f2- || true)
[[ "$http_port" =~ ^[0-9]+$ ]] && (( http_port >= 1 && http_port <= 65535 )) || die 'XINYUE_HTTP_PORT 必须是 1-65535 的端口号。'
[[ -n "$http_bind" ]] || die 'XINYUE_HTTP_BIND 不能为空。'

for secret_key in POSTGRES_PASSWORD SESSION_SECRET CREDENTIAL_ENCRYPTION_KEY INSTALL_TOKEN LOCAL_WORKER_TOKEN; do
  secret_value=$(grep -E "^${secret_key}=" .env.production | head -n 1 | cut -d= -f2- || true)
  [[ ${#secret_value} -ge 32 ]] || die "${secret_key} 必须至少包含 32 个字符。"
  [[ ! "$secret_value" =~ (replace-with|change-me|changeme|example|dev_password|default-password|your[_-]|flux[_-]?dev|xinyue[_-]?(rc|dev|test)|local[_-]?only|staging|test[_-]?(secret|password)) ]] || die "${secret_key} 仍是占位值或测试值。"
done
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

# Do not report a successful installation until the API and web container
# health checks have passed. This makes failed migrations/configuration
# visible to the operator instead of leaving a partially started stack.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180
docker compose --env-file .env.production -f docker-compose.prod.yml ps
printf '\nXinyue AI 已安装，内部地址：http://%s:%s/\n' "$http_bind" "$http_port"
printf '首次启动请打开：http://%s:%s/install（通过 HTTPS 反代访问时使用外部域名）\n' "$http_bind" "$http_port"
printf '一次性安装令牌已保存到当前目录的 .env.production，不会输出到终端或日志。\n'
printf '请仅在服务器本机按最小权限读取，并在初始化页面中输入；不要通过 URL、聊天工具或工单传输。\n'
printf '启用 HTTPS 后请将 WEB_ORIGIN 改为 https://域名，并设置 COOKIE_SECURE=true。\n'
