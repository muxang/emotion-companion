#!/usr/bin/env bash
# ============================================================
# 一键部署 Admin API（在已有 emotion-api 的 VPS 上增量添加）
# ============================================================
# 用法：
#   sudo bash scripts/vps/add-admin-api.sh
#
# 前提：emotion-api 已经在跑（setup.sh / bootstrap.sh 已完成）
#
# 这个脚本做什么：
#   1. 从主 API .env 复用 DATABASE_URL
#   2. 自动生成 ADMIN_TOKEN
#   3. 写 admin-api .env
#   4. 安装 systemd unit + 开机自启
#   5. 给 Nginx 加 /admin/ 路由（平滑 reload，主 API 零影响）
#   6. 启动 admin-api + 健康检查
#   7. 更新 config.sh + deploy.sh 变量（后续 deploy.sh 自动管两个服务）
#
# 幂等：重复运行安全，已完成的步骤会跳过
# ============================================================

set -euo pipefail

C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_BLUE='\033[0;34m'
C_BOLD='\033[1m'
C_RESET='\033[0m'

log()  { echo -e "${C_BLUE}[admin-api]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[  ok  ]${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}[ warn ]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[ err  ]${C_RESET} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "请以 root 运行：sudo bash $0"
  exit 1
fi

# ---- 配置 ----
APP_USER="emotion"
APP_DIR="/home/${APP_USER}/emotion"
ADMIN_SERVICE="emotion-admin-api"
ADMIN_PORT="3001"
API_PORT="3000"

MAIN_ENV="${APP_DIR}/apps/api/.env"
ADMIN_ENV="${APP_DIR}/apps/admin-api/.env"
NGINX_CONF="/etc/nginx/sites-available/emotion-api"
CONFIG_SH="${APP_DIR}/scripts/vps/config.sh"

# ---- 预检 ----
if [[ ! -f "${MAIN_ENV}" ]]; then
  err "找不到 ${MAIN_ENV}，请先部署主 API（跑 setup.sh 或 bootstrap.sh）"
  exit 1
fi

if ! systemctl is-active --quiet emotion-api 2>/dev/null; then
  warn "emotion-api 当前未运行，继续安装 admin-api 但最后可能需要手动检查"
fi

echo
echo -e "${C_BOLD}╔══════════════════════════════════════════════════════════╗"
echo -e "║       Admin API 一键部署（增量，不影响主 API）           ║"
echo -e "╚══════════════════════════════════════════════════════════╝${C_RESET}"
echo

# ============================================================
# Step 1: 拉最新代码 + 安装依赖
# ============================================================
log "Step 1/6: 拉代码 + 安装依赖"
sudo -u "${APP_USER}" -H bash -c "cd '${APP_DIR}' && git pull origin main"
sudo -u "${APP_USER}" -H bash -c "cd '${APP_DIR}' && pnpm install --frozen-lockfile"
ok "  代码和依赖已更新"

# ============================================================
# Step 2: 创建 admin-api .env
# ============================================================
log "Step 2/6: 准备 ${ADMIN_ENV}"

if [[ -f "${ADMIN_ENV}" ]] && ! grep -q '__FILL_ME__\|__ADMIN_TOKEN_PLACEHOLDER__\|__YOUR_ADMIN' "${ADMIN_ENV}"; then
  ok "  ${ADMIN_ENV} 已存在且已填写，跳过"
else
  # 从主 API 复用 DATABASE_URL 和 DATABASE_SSL
  DB_URL="$(grep '^DATABASE_URL=' "${MAIN_ENV}" | cut -d= -f2-)"
  DB_SSL="$(grep '^DATABASE_SSL=' "${MAIN_ENV}" | cut -d= -f2- || echo 'true')"

  if [[ -z "${DB_URL}" ]]; then
    err "主 API .env 中找不到 DATABASE_URL"
    exit 1
  fi

  # 生成强随机 ADMIN_TOKEN
  ADMIN_TOKEN="$(openssl rand -hex 32)"

  cat > "${ADMIN_ENV}" <<EOF
NODE_ENV=production
DATABASE_URL=${DB_URL}
DATABASE_SSL=${DB_SSL}
ADMIN_PORT=${ADMIN_PORT}
ADMIN_HOST=127.0.0.1
ADMIN_TOKEN=${ADMIN_TOKEN}
ADMIN_CORS_ORIGIN=*
LOG_LEVEL=info
API_BASE_URL=http://127.0.0.1:${API_PORT}
EOF

  chown "${APP_USER}:${APP_USER}" "${ADMIN_ENV}"
  chmod 600 "${ADMIN_ENV}"
  ok "  已生成 ${ADMIN_ENV}"
  echo
  echo -e "  ${C_BOLD}ADMIN_TOKEN=${ADMIN_TOKEN}${C_RESET}"
  echo -e "  ${C_YELLOW}>>> 记下这个 token，admin 前端登录要用 <<<${C_RESET}"
  echo
fi

# ============================================================
# Step 3: 安装 systemd unit
# ============================================================
log "Step 3/6: 安装 systemd unit"

UNIT_FILE="/etc/systemd/system/${ADMIN_SERVICE}.service"

cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Emotion Companion Admin API
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/apps/admin-api
ExecStart=/usr/bin/node --import tsx --env-file=${ADMIN_ENV} ${APP_DIR}/apps/admin-api/src/index.ts
Restart=on-failure
RestartSec=3
StartLimitIntervalSec=60
StartLimitBurst=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${ADMIN_SERVICE}
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${APP_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${ADMIN_SERVICE}" >/dev/null 2>&1
ok "  ${UNIT_FILE} 已安装 + 开机自启"

# ============================================================
# Step 4: 给 Nginx 加 /admin/ 路由
# ============================================================
log "Step 4/6: 更新 Nginx 配置"

if [[ ! -f "${NGINX_CONF}" ]]; then
  err "找不到 ${NGINX_CONF}，Nginx 配置异常"
  exit 1
fi

if grep -q 'location /admin/' "${NGINX_CONF}"; then
  ok "  Nginx 已有 /admin/ 路由，跳过"
else
  # 在第一个 "location / {" 之前插入 /admin/ block
  # 创建临时文件安全写入（避免 sed -i 在复杂转义下出问题）
  TMPFILE="$(mktemp)"
  INSERTED=false

  while IFS= read -r line; do
    # 匹配第一个 location / { （主 API 的 catch-all）
    if [[ "${INSERTED}" == "false" ]] && echo "${line}" | grep -qE '^\s*location\s+/\s*\{'; then
      # 在它前面插入 admin 路由
      cat >> "${TMPFILE}" <<'ADMIN_BLOCK'

    # ---- Admin API: /admin/* -> port 3001 ----
    location /admin/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

ADMIN_BLOCK
      INSERTED=true
    fi
    printf '%s\n' "${line}" >> "${TMPFILE}"
  done < "${NGINX_CONF}"

  if [[ "${INSERTED}" == "true" ]]; then
    cp "${NGINX_CONF}" "${NGINX_CONF}.bak.$(date +%s)"
    mv "${TMPFILE}" "${NGINX_CONF}"
    ok "  已添加 /admin/ 路由（原配置已备份）"
  else
    rm -f "${TMPFILE}"
    warn "  未找到 'location / {' 入口，请手动添加 /admin/ 路由"
  fi

  # 验证语法 + 平滑重载
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    ok "  Nginx 已 reload（主 API 连接不中断）"
  else
    err "  Nginx 配置语法错误！回滚："
    LATEST_BAK="$(ls -t "${NGINX_CONF}".bak.* 2>/dev/null | head -1)"
    if [[ -n "${LATEST_BAK}" ]]; then
      cp "${LATEST_BAK}" "${NGINX_CONF}"
      nginx -t && systemctl reload nginx
      err "  已回滚到 ${LATEST_BAK}"
    fi
    err "  请手动检查 ${NGINX_CONF}"
    exit 1
  fi
fi

# ============================================================
# Step 5: 更新 config.sh（让 deploy.sh 知道有 admin-api）
# ============================================================
log "Step 5/6: 更新 config.sh"

if [[ -f "${CONFIG_SH}" ]]; then
  if grep -q 'ADMIN_SERVICE_NAME' "${CONFIG_SH}"; then
    ok "  config.sh 已有 admin 变量，跳过"
  else
    cat >> "${CONFIG_SH}" <<EOF

# ---- Admin API（由 add-admin-api.sh 自动追加）----
ADMIN_SERVICE_NAME="${ADMIN_SERVICE}"
ADMIN_PORT="${ADMIN_PORT}"
EOF
    ok "  已追加 admin 变量到 config.sh"
  fi
fi

# ============================================================
# Step 6: 启动 + 健康检查
# ============================================================
log "Step 6/6: 启动 ${ADMIN_SERVICE}"

systemctl restart "${ADMIN_SERVICE}"

ADMIN_OK=false
for i in 1 2 3 4 5 6; do
  sleep 1
  if curl -fsS "http://127.0.0.1:${ADMIN_PORT}/admin/health" >/dev/null 2>&1; then
    ADMIN_OK=true
    break
  fi
done

echo

if [[ "${ADMIN_OK}" == "true" ]]; then
  # 验证主 API 仍然正常
  API_HEALTH="$(curl -fsS "http://127.0.0.1:${API_PORT}/api/health" 2>/dev/null || echo '(无响应)')"
  ADMIN_HEALTH="$(curl -fsS "http://127.0.0.1:${ADMIN_PORT}/admin/health" 2>/dev/null || echo '{}')"

  # 读 ADMIN_TOKEN 显示
  SAVED_TOKEN="$(grep '^ADMIN_TOKEN=' "${ADMIN_ENV}" | cut -d= -f2-)"

  echo -e "${C_GREEN}${C_BOLD}╔══════════════════════════════════════════════════════════╗"
  echo -e "║                  Admin API 部署完成 ✅                    ║"
  echo -e "╚══════════════════════════════════════════════════════════╝${C_RESET}"
  echo
  echo -e "  ${C_BOLD}主 API${C_RESET}       ${API_HEALTH}"
  echo -e "  ${C_BOLD}Admin API${C_RESET}    ${ADMIN_HEALTH}"
  echo
  echo -e "  ${C_BOLD}ADMIN_TOKEN${C_RESET}  ${SAVED_TOKEN}"
  echo -e "  ${C_YELLOW}（admin 前端登录时输入这个 token）${C_RESET}"
  echo
  echo -e "  ${C_BOLD}日志${C_RESET}         sudo journalctl -u ${ADMIN_SERVICE} -f"
  echo -e "  ${C_BOLD}重启${C_RESET}         sudo systemctl restart ${ADMIN_SERVICE}"
  echo -e "  ${C_BOLD}改 .env${C_RESET}      sudo nano ${ADMIN_ENV}"
  echo
  echo -e "${C_BOLD}下一步：${C_RESET}"
  echo "  1. Vercel 部署 admin 前端："
  echo "     Root Directory = apps/admin"
  echo "     环境变量 VITE_ADMIN_API_URL = https://api.botjive.net"
  echo
  echo "  2. 拿到 Vercel 域名后，回来改 ADMIN_CORS_ORIGIN："
  echo "     sudo nano ${ADMIN_ENV}"
  echo "     # 把 ADMIN_CORS_ORIGIN=* 改为 https://你的域名"
  echo "     sudo systemctl restart ${ADMIN_SERVICE}"
  echo
  echo "  3. 以后更新代码，一条命令同时更新两个 API："
  echo "     sudo -u emotion -H bash ${APP_DIR}/scripts/vps/deploy.sh"
  echo
else
  err "${ADMIN_SERVICE} 启动失败"
  echo
  err "查看日志：sudo journalctl -u ${ADMIN_SERVICE} -n 50 --no-pager"
  echo
  journalctl -u "${ADMIN_SERVICE}" -n 20 --no-pager 2>/dev/null || true
  exit 1
fi
