#!/usr/bin/env bash
# ============================================================
# Emotion Companion - VPS 一次性初始化脚本
# ============================================================
# 用法：
#   1. 编辑 config.sh（从 config.example.sh 复制）
#   2. sudo bash scripts/vps/setup.sh
#
# 这个脚本是幂等的：你可以反复运行，已完成的步骤会被自动跳过。
#
# 它做了什么：
#   - 安装 Node 20 / pnpm / nginx / certbot / ufw
#   - 创建 APP_USER 用户（如果不存在）
#   - 用 APP_USER 身份 clone 仓库（如果不存在）
#   - pnpm install + 构建 apps/api
#   - 在 apps/api/.env 写入生产环境模板（含强随机 JWT_SECRET）
#   - 写 systemd unit + Nginx 反代配置
#   - 配置防火墙（只放 22 / 80 / 443）
#   - 申请 HTTPS 证书（如果还没有）
#   - 检测 .env 占位符是否已填，全部填好则启动服务
# ============================================================

set -euo pipefail

# 颜色
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_BLUE='\033[0;34m'
C_RESET='\033[0m'

log()    { echo -e "${C_BLUE}[setup]${C_RESET} $*"; }
ok()     { echo -e "${C_GREEN}[ ok ]${C_RESET} $*"; }
warn()   { echo -e "${C_YELLOW}[warn]${C_RESET} $*"; }
err()    { echo -e "${C_RED}[err ]${C_RESET} $*" >&2; }

# 必须 root 运行
if [[ $EUID -ne 0 ]]; then
  err "请以 root 运行：sudo bash $0"
  exit 1
fi

# 必须是 Debian/Ubuntu(本脚本用 apt-get / ufw)
if [[ ! -f /etc/os-release ]] || ! grep -qE "^ID(_LIKE)?=.*\b(ubuntu|debian)\b" /etc/os-release; then
  DETECTED_OS="$(grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"' || echo unknown)"
  err "本脚本只支持 Ubuntu / Debian,但检测到: ${DETECTED_OS}"
  err "请把 VPS 重装为 Ubuntu 22.04 LTS 后重试"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR}/templates"
CONFIG_FILE="${SCRIPT_DIR}/config.sh"

# ---------- 读取配置 ----------
if [[ ! -f "${CONFIG_FILE}" ]]; then
  err "找不到 ${CONFIG_FILE}"
  err "请先：cp ${SCRIPT_DIR}/config.example.sh ${CONFIG_FILE} && nano ${CONFIG_FILE}"
  exit 1
fi
# shellcheck source=/dev/null
source "${CONFIG_FILE}"

# 校验关键变量
for var in REPO_URL BRANCH APP_USER APP_DIR API_DOMAIN ACME_EMAIL SERVICE_NAME NODE_PORT; do
  if [[ -z "${!var:-}" ]]; then
    err "config.sh 中 ${var} 为空"
    exit 1
  fi
done
if [[ "${REPO_URL}" == *"your-username"* ]]; then
  err "config.sh 中 REPO_URL 还是示例值，请先填真实仓库地址"
  exit 1
fi
if [[ "${API_DOMAIN}" == "api.example.com" ]]; then
  err "config.sh 中 API_DOMAIN 还是示例值，请先填真实域名"
  exit 1
fi

log "REPO_URL    = ${REPO_URL}"
log "BRANCH      = ${BRANCH}"
log "APP_USER    = ${APP_USER}"
log "APP_DIR     = ${APP_DIR}"
log "API_DOMAIN  = ${API_DOMAIN}"
log "SERVICE     = ${SERVICE_NAME}"

# ============================================================
# Step 1: 检查并按需安装系统依赖
# ============================================================
# 设计原则：
#  - 全部"先检测、再决定要不要装"
#  - 只在确实有东西要装时才执行 apt-get update
#  - 全部已安装时本步骤是 0 网络 0 副作用的纯检查
# ============================================================
log "Step 1/9: 检查系统依赖"

export DEBIAN_FRONTEND=noninteractive

NEED_NODE=false
NEED_NODESOURCE_REPO=false
NEED_PNPM=false
APT_MISSING=()

# ---- Node 20+ ----
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version 2>/dev/null || echo 'none')"
  if echo "${NODE_VER}" | grep -qE '^v(2[0-9]|[3-9][0-9])\.'; then
    ok "  Node 已安装且版本满足要求：${NODE_VER}"
    # 顺便检查 --env-file 支持（Node 20.6+）
    NODE_MINOR="$(node -p 'process.versions.node' | cut -d. -f1,2)"
    NODE_MAJOR="$(node -p 'process.versions.node' | cut -d. -f1)"
    if [[ "${NODE_MAJOR}" == "20" ]]; then
      NODE_PATCH_OK="$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===20&&b<6)?1:0)')" || true
      if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a===20&&b<6)process.exit(1)' 2>/dev/null; then
        warn "  Node ${NODE_VER} 不支持 --env-file（需要 20.6+），将升级"
        NEED_NODE=true
        NEED_NODESOURCE_REPO=true
      fi
    fi
  else
    warn "  Node 当前版本 ${NODE_VER} 太低，将升级到 20.x"
    NEED_NODE=true
    NEED_NODESOURCE_REPO=true
  fi
else
  log "  Node 未安装，将安装 20.x（NodeSource）"
  NEED_NODE=true
  NEED_NODESOURCE_REPO=true
fi

# ---- pnpm（通过 corepack）----
if command -v pnpm >/dev/null 2>&1; then
  ok "  pnpm 已安装：$(pnpm --version)"
else
  log "  pnpm 未安装，将通过 corepack 启用"
  NEED_PNPM=true
fi

# ---- apt 包：git / nginx / certbot / ufw ----
APT_PKGS=(git nginx certbot python3-certbot-nginx ufw curl ca-certificates)
for pkg in "${APT_PKGS[@]}"; do
  if dpkg -s "${pkg}" >/dev/null 2>&1; then
    : # 已装，安静
  else
    APT_MISSING+=("${pkg}")
  fi
done

if [[ ${#APT_MISSING[@]} -gt 0 ]]; then
  log "  待安装 apt 包：${APT_MISSING[*]}"
else
  ok "  apt 包已齐全（${APT_PKGS[*]}）"
fi

# ---- 决定是否要 apt-get update（只在真有东西要装时）----
if [[ "${NEED_NODE}" == "true" || ${#APT_MISSING[@]} -gt 0 ]]; then
  log "  apt-get update（首次或缺包时才跑）"
  apt-get update -qq
fi

# ---- 安装 Node 20 ----
if [[ "${NEED_NODE}" == "true" ]]; then
  if [[ "${NEED_NODESOURCE_REPO}" == "true" ]]; then
    log "  添加 NodeSource 20.x 源"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  fi
  log "  apt install nodejs"
  apt-get install -y nodejs >/dev/null
  ok "  Node 安装完成：$(node --version)"
fi

# ---- 安装 apt 包 ----
if [[ ${#APT_MISSING[@]} -gt 0 ]]; then
  log "  apt install: ${APT_MISSING[*]}"
  apt-get install -y "${APT_MISSING[@]}" >/dev/null
  ok "  apt 包安装完成"
fi

# ---- 启用 pnpm ----
if [[ "${NEED_PNPM}" == "true" ]]; then
  log "  corepack enable + prepare pnpm@8.15.5"
  corepack enable
  corepack prepare pnpm@8.15.5 --activate
  ok "  pnpm 安装完成：$(pnpm --version)"
fi

if [[ "${NEED_NODE}" == "false" && "${NEED_PNPM}" == "false" && ${#APT_MISSING[@]} -eq 0 ]]; then
  ok "  全部依赖已就绪，本步骤未做任何安装"
fi

# ============================================================
# Step 2: 创建 APP_USER
# ============================================================
log "Step 2/9: 准备 APP_USER (${APP_USER})"

if id "${APP_USER}" >/dev/null 2>&1; then
  ok "  用户 ${APP_USER} 已存在"
else
  log "  创建用户 ${APP_USER}"
  adduser --disabled-password --gecos "" "${APP_USER}"
fi

# 让 APP_USER 也能用 corepack/pnpm（corepack 的 shim 在 /usr/bin 已经全局可用，
# 但 PNPM_HOME 需要在用户自己的 shell rc 里设一下，避免 build 时找不到 store）
USER_HOME="/home/${APP_USER}"
if ! grep -q "PNPM_HOME" "${USER_HOME}/.bashrc" 2>/dev/null; then
  cat >> "${USER_HOME}/.bashrc" <<'EOF'

# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
EOF
  chown "${APP_USER}:${APP_USER}" "${USER_HOME}/.bashrc"
fi

# ============================================================
# Step 3: clone 仓库
# ============================================================
log "Step 3/9: 准备代码（${APP_DIR}）"

if [[ -d "${APP_DIR}/.git" ]]; then
  ok "  仓库已存在，跳过 clone（更新走 deploy.sh）"
else
  log "  clone ${REPO_URL} (branch=${BRANCH}) → ${APP_DIR}"
  sudo -u "${APP_USER}" git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

# ============================================================
# Step 4: 安装依赖 + 构建（如果 node_modules 与 dist 已存在则跳过）
# ============================================================
# 重跑 setup.sh 时（例如只想修 nginx 配置），不应该重新 pnpm install + build。
# 增量更新走 deploy.sh，那里会强制 git pull + install + build。
# ============================================================
log "Step 4/9: 依赖与构建"

NEED_INSTALL=true
if [[ -d "${APP_DIR}/node_modules" && -f "${APP_DIR}/apps/api/dist/index.js" ]]; then
  ok "  node_modules + apps/api/dist 已存在，跳过 install/build"
  ok "  （要强制重建请跑：bash ${SCRIPT_DIR}/deploy.sh）"
  NEED_INSTALL=false
fi

if [[ "${NEED_INSTALL}" == "true" ]]; then
  log "  pnpm install --frozen-lockfile"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && pnpm install --frozen-lockfile"
  log "  pnpm --filter @emotion/api run build"
  sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && pnpm --filter @emotion/api run build"

  if [[ ! -f "${APP_DIR}/apps/api/dist/index.js" ]]; then
    err "构建产物 ${APP_DIR}/apps/api/dist/index.js 不存在，构建可能失败"
    exit 1
  fi
  ok "  构建完成"
fi

# ============================================================
# Step 5: 写 .env（仅在不存在时）
# ============================================================
log "Step 5/9: 准备 apps/api/.env"

ENV_FILE="${APP_DIR}/apps/api/.env"
ENV_TEMPLATE="${TEMPLATES_DIR}/env.production.template"

if [[ -f "${ENV_FILE}" ]]; then
  ok "  ${ENV_FILE} 已存在，不覆盖"
else
  log "  从模板创建 ${ENV_FILE}"
  # 生成强随机 JWT_SECRET
  JWT_SECRET_VALUE="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
  CORS_ORIGIN_PLACEHOLDER="https://__YOUR_FRONTEND_DOMAIN__"

  sed \
    -e "s|__APP_USER__|${APP_USER}|g" \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__NODE_PORT__|${NODE_PORT}|g" \
    -e "s|__JWT_SECRET_PLACEHOLDER__|${JWT_SECRET_VALUE}|g" \
    -e "s|__CORS_ORIGIN_FILL_ME__|${CORS_ORIGIN_PLACEHOLDER}|g" \
    "${ENV_TEMPLATE}" > "${ENV_FILE}"

  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  ok "  已生成 .env，含强随机 JWT_SECRET"
fi

# ============================================================
# Step 6: systemd unit（内容变更才 daemon-reload）
# ============================================================
log "Step 6/9: 安装 systemd unit"

SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
SYSTEMD_TMP="$(mktemp)"
sed \
  -e "s|__APP_USER__|${APP_USER}|g" \
  -e "s|__APP_DIR__|${APP_DIR}|g" \
  -e "s|__SERVICE_NAME__|${SERVICE_NAME}|g" \
  "${TEMPLATES_DIR}/emotion-api.service.template" > "${SYSTEMD_TMP}"

if [[ -f "${SYSTEMD_UNIT}" ]] && cmp -s "${SYSTEMD_TMP}" "${SYSTEMD_UNIT}"; then
  ok "  ${SYSTEMD_UNIT} 内容无变化"
  rm -f "${SYSTEMD_TMP}"
else
  mv "${SYSTEMD_TMP}" "${SYSTEMD_UNIT}"
  systemctl daemon-reload
  ok "  ${SYSTEMD_UNIT} 已更新 + daemon-reload"
fi

if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
  : # 已 enable
else
  systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
  ok "  已设置开机自启"
fi

# ============================================================
# Step 7: Nginx 反代（内容变更才 reload）
# ============================================================
log "Step 7/9: 配置 Nginx 反代"

NGINX_AVAILABLE="/etc/nginx/sites-available/${SERVICE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SERVICE_NAME}"
NGINX_TMP="$(mktemp)"

sed \
  -e "s|__API_DOMAIN__|${API_DOMAIN}|g" \
  -e "s|__NODE_PORT__|${NODE_PORT}|g" \
  "${TEMPLATES_DIR}/nginx-emotion-api.conf.template" > "${NGINX_TMP}"

NGINX_CHANGED=false
if [[ ! -f "${NGINX_AVAILABLE}" ]] || ! cmp -s "${NGINX_TMP}" "${NGINX_AVAILABLE}"; then
  # certbot 后续会往这个文件里追加 ssl 配置；首次写入或模板变更时才覆盖
  if [[ -f "${NGINX_AVAILABLE}" ]] && grep -q "managed by Certbot" "${NGINX_AVAILABLE}"; then
    ok "  ${NGINX_AVAILABLE} 已含 Certbot 自动改写内容，跳过覆盖"
    rm -f "${NGINX_TMP}"
  else
    mv "${NGINX_TMP}" "${NGINX_AVAILABLE}"
    NGINX_CHANGED=true
    ok "  ${NGINX_AVAILABLE} 已更新"
  fi
else
  ok "  ${NGINX_AVAILABLE} 内容无变化"
  rm -f "${NGINX_TMP}"
fi

if [[ ! -L "${NGINX_ENABLED}" ]]; then
  ln -s "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
  NGINX_CHANGED=true
fi

# 删掉默认的 default 站点（如果还在）
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
  NGINX_CHANGED=true
fi

if [[ "${NGINX_CHANGED}" == "true" ]]; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    ok "  Nginx 已 reload"
  else
    err "Nginx 配置语法错误，请检查："
    nginx -t
    exit 1
  fi
else
  ok "  Nginx 无需 reload"
fi

# ============================================================
# Step 8: UFW 防火墙 + HTTPS 证书
# ============================================================
log "Step 8/9: 防火墙 + HTTPS"

# 防火墙：允许 SSH/HTTP/HTTPS（ufw 自带去重）
UFW_STATUS="$(ufw status 2>/dev/null || echo inactive)"
if echo "${UFW_STATUS}" | grep -q "Status: active"; then
  ok "  ufw 已处于 active 状态"
else
  log "  启用 ufw"
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "  ufw: 22/80/443 开放"
fi
# 即便 ufw 已 active，也确保这三个端口规则都在
for port in 22 80 443; do
  if ! ufw status | grep -qE "^${port}/tcp\s+ALLOW"; then
    ufw allow "${port}/tcp" >/dev/null 2>&1 || true
    log "  补加 ufw 规则：${port}/tcp"
  fi
done

# certbot：检测是否已经申请过证书，没有则申请
CERT_PATH="/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem"
if [[ -f "${CERT_PATH}" ]]; then
  ok "  HTTPS 证书已存在：${CERT_PATH}"
else
  log "  申请 HTTPS 证书（需要 ${API_DOMAIN} 的 A 记录已经指向本机）"
  if certbot --nginx \
      -d "${API_DOMAIN}" \
      --non-interactive \
      --agree-tos \
      --email "${ACME_EMAIL}" \
      --redirect; then
    ok "  HTTPS 证书申请成功"
  else
    warn "  certbot 申请失败，请检查 DNS 是否生效。可以稍后手动重跑："
    warn "    sudo certbot --nginx -d ${API_DOMAIN}"
  fi
fi

# ============================================================
# Step 9: 检查 .env 是否填好，决定是否启动
# ============================================================
log "Step 9/9: 检查 .env 占位符"

# 只在非注释行（不以 # 开头）且形如 KEY=VALUE 的行里查占位符
# grep -v '^[[:space:]]*#' 排除注释
PLACEHOLDERS=()
NONCOMMENT_HITS="$(grep -v '^[[:space:]]*#' "${ENV_FILE}" | grep '__FILL_ME__' || true)"
if [[ -n "${NONCOMMENT_HITS}" ]]; then
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    PLACEHOLDERS+=("${line%%=*}")
  done <<< "${NONCOMMENT_HITS}"
fi
if grep -v '^[[:space:]]*#' "${ENV_FILE}" | grep -q "__YOUR_FRONTEND_DOMAIN__"; then
  PLACEHOLDERS+=("CORS_ORIGIN")
fi

echo
if [[ ${#PLACEHOLDERS[@]} -gt 0 ]]; then
  warn "==============================================================="
  warn " 还有 ${#PLACEHOLDERS[@]} 个字段需要你手工填写："
  for p in "${PLACEHOLDERS[@]}"; do
    warn "   - ${p}"
  done
  warn ""
  warn " 请编辑：sudo nano ${ENV_FILE}"
  warn " 填好后启动服务："
  warn "   sudo systemctl start ${SERVICE_NAME}"
  warn "   sudo journalctl -u ${SERVICE_NAME} -f"
  warn "==============================================================="
else
  log "  .env 检查通过，启动服务"
  systemctl restart "${SERVICE_NAME}"
  sleep 1
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    ok "  ${SERVICE_NAME} 已运行"
    echo
    ok "==============================================================="
    ok " 部署完成 🎉"
    ok ""
    ok " 健康检查："
    ok "   curl -i https://${API_DOMAIN}/api/health"
    ok ""
    ok " 查看日志："
    ok "   sudo journalctl -u ${SERVICE_NAME} -f"
    ok ""
    ok " 后续更新（拉新代码后重启）："
    ok "   bash ${SCRIPT_DIR}/deploy.sh"
    ok "==============================================================="
  else
    err "${SERVICE_NAME} 启动失败，请查看日志："
    err "  sudo journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
    exit 1
  fi
fi
