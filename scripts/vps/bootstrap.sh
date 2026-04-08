#!/usr/bin/env bash
# ============================================================
# Emotion Companion - 一键部署脚本（bootstrap.sh）
# ============================================================
# 适用：VPS 全新 Ubuntu 22.04 / 24.04，境外节点（无需备案）
#
# 一条命令上线（在 VPS 上执行）：
#
#   sudo bash <(curl -fsSL https://raw.githubusercontent.com/muxang/emotion-companion/main/scripts/vps/bootstrap.sh)
#
# 这个脚本会做：
#   1. 检查环境（root / Ubuntu）
#   2. 把已知配置（域名 / 邮箱 / 仓库）打印出来等你确认
#   3. 交互式让你输入 3 个 secret：ANTHROPIC_API_KEY / DATABASE_URL / CORS_ORIGIN
#   4. clone 仓库到 /tmp
#   5. 生成 config.sh + 跑 setup.sh（装依赖 / 写 systemd / Nginx / certbot）
#   6. 把 secret 安全写入 apps/api/.env（不走 sed 避免特殊字符问题）
#   7. 启动 emotion-api 服务
#   8. 跑数据库迁移
#   9. 自检 /api/health
#
# 这个脚本是幂等的：再跑一次，setup.sh 内部会跳过已完成的步骤，
# 你也可以选择"跳过 secret 输入只重启"。
# ============================================================

set -euo pipefail

# ============================================================
# 写死的项目配置（已经从 git remote 拿到）
# ============================================================
REPO_URL="https://github.com/muxang/emotion-companion.git"
BRANCH="main"
APP_USER="emotion"
APP_DIR="/home/${APP_USER}/emotion"
API_DOMAIN="api.botjive.net"
ACME_EMAIL="chairsmu@gmail.com"
SERVICE_NAME="emotion-api"
NODE_PORT="3000"

# ============================================================
# 颜色 + 日志
# ============================================================
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_BLUE='\033[0;34m'
C_BOLD='\033[1m'
C_RESET='\033[0m'

log()  { echo -e "${C_BLUE}[bootstrap]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[  ok  ]${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}[ warn ]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[ err  ]${C_RESET} $*" >&2; }

# 让所有交互输入从 /dev/tty 读，兼容 curl | bash 与 bash <(curl ...) 两种调用方式
TTY_IN="/dev/tty"
if [[ ! -r "${TTY_IN}" ]]; then
  err "无法读取 /dev/tty，请用 SSH 直接登录 VPS 后运行（不要在管道里）"
  exit 1
fi

# ============================================================
# 0. 预检
# ============================================================
if [[ $EUID -ne 0 ]]; then
  err "请以 root 运行：sudo bash <(curl -fsSL ...)"
  exit 1
fi

if [[ ! -f /etc/os-release ]] || ! grep -q "Ubuntu" /etc/os-release; then
  warn "未检测到 Ubuntu /etc/os-release，可能不兼容（仅在 Ubuntu 22.04 / 24.04 测过）"
fi

# ============================================================
# 1. 横幅 + 确认
# ============================================================
clear
cat <<EOF
${C_BOLD}╔══════════════════════════════════════════════════════════════╗
║          Emotion Companion · 一键部署 (bootstrap)            ║
╚══════════════════════════════════════════════════════════════╝${C_RESET}

  仓库       ${REPO_URL}
  分支       ${BRANCH}
  域名       ${API_DOMAIN}
  邮箱       ${ACME_EMAIL}  (Let's Encrypt 续期通知)
  应用用户   ${APP_USER}
  应用目录   ${APP_DIR}
  服务名     ${SERVICE_NAME}
  端口       ${NODE_PORT}  (只在 127.0.0.1)

${C_YELLOW}请在开始前确认：${C_RESET}
  ✓ ${API_DOMAIN} 的 A 记录已经指向本 VPS（境外节点 + Cloudflare DNS-only 灰云）
  ✓ 已准备好 ANTHROPIC_API_KEY
  ✓ 已准备好 Supabase DATABASE_URL
  ✓ 已准备好 Vercel 前端域名 (如果还没部署,可以先填占位,部完前端再回来改)

EOF

read -rp "确认开始部署？(y/N) " CONFIRM < "${TTY_IN}"
if [[ ! "${CONFIRM,,}" =~ ^y(es)?$ ]]; then
  log "已取消"
  exit 0
fi
echo

# ============================================================
# 2. 检测是否已有可用 .env，决定是否跳过 secret 输入
# ============================================================
ENV_FILE="${APP_DIR}/apps/api/.env"
SKIP_SECRETS=false

if [[ -f "${ENV_FILE}" ]] && ! grep -qE '__FILL_ME__|__YOUR_FRONTEND_DOMAIN__' "${ENV_FILE}"; then
  warn "检测到 ${ENV_FILE} 已配置完整（不含占位符）"
  read -rp "跳过 secret 输入,只重新跑 setup + 重启服务？(Y/n) " SKIP_ANS < "${TTY_IN}"
  if [[ ! "${SKIP_ANS,,}" =~ ^n(o)?$ ]]; then
    SKIP_SECRETS=true
    ok "  将跳过 secret 输入"
  fi
  echo
fi

# ============================================================
# 3. 交互式输入 secrets（如果需要）
# ============================================================
ANTHROPIC_API_KEY_INPUT=""
DATABASE_URL_INPUT=""
CORS_ORIGIN_INPUT=""
REDIS_URL_INPUT=""
ANTHROPIC_BASE_URL_INPUT=""

if [[ "${SKIP_SECRETS}" == "false" ]]; then
  log "请输入以下 secret（输入时不显示，回车确认）"
  echo

  # ANTHROPIC_API_KEY
  while [[ -z "${ANTHROPIC_API_KEY_INPUT}" ]]; do
    read -rsp "  ANTHROPIC_API_KEY (sk-ant-...): " ANTHROPIC_API_KEY_INPUT < "${TTY_IN}"
    echo
    if [[ ! "${ANTHROPIC_API_KEY_INPUT}" =~ ^sk-ant- ]]; then
      warn "  看起来不像 Anthropic key (一般以 sk-ant- 开头),确定要用？"
      read -rp "  继续？(y/N) " confirm < "${TTY_IN}"
      [[ ! "${confirm,,}" =~ ^y$ ]] && ANTHROPIC_API_KEY_INPUT=""
    fi
  done
  ok "  ANTHROPIC_API_KEY 已收到 (${#ANTHROPIC_API_KEY_INPUT} chars)"

  # DATABASE_URL
  while [[ -z "${DATABASE_URL_INPUT}" ]]; do
    read -rsp "  DATABASE_URL (postgresql://...): " DATABASE_URL_INPUT < "${TTY_IN}"
    echo
    if [[ ! "${DATABASE_URL_INPUT}" =~ ^postgres(ql)?:// ]]; then
      warn "  看起来不像 PostgreSQL connection string"
      read -rp "  继续？(y/N) " confirm < "${TTY_IN}"
      [[ ! "${confirm,,}" =~ ^y$ ]] && DATABASE_URL_INPUT=""
    fi
  done
  ok "  DATABASE_URL 已收到"

  # CORS_ORIGIN
  echo
  log "  CORS_ORIGIN 是你前端的最终域名（含 https://，不要带尾斜杠）"
  log "  如果还没部署 Vercel,可以先填一个占位例如 https://placeholder.vercel.app,部完再改"
  while [[ -z "${CORS_ORIGIN_INPUT}" ]]; do
    read -rp "  CORS_ORIGIN: " CORS_ORIGIN_INPUT < "${TTY_IN}"
    if [[ ! "${CORS_ORIGIN_INPUT}" =~ ^https?:// ]]; then
      warn "  必须以 http:// 或 https:// 开头"
      CORS_ORIGIN_INPUT=""
    fi
  done
  # 去尾斜杠
  CORS_ORIGIN_INPUT="${CORS_ORIGIN_INPUT%/}"
  ok "  CORS_ORIGIN = ${CORS_ORIGIN_INPUT}"

  # REDIS_URL（可选）
  echo
  read -rp "  REDIS_URL (Upstash,留空跳过): " REDIS_URL_INPUT < "${TTY_IN}"
  if [[ -n "${REDIS_URL_INPUT}" ]]; then
    ok "  REDIS_URL 已收到"
  else
    ok "  REDIS_URL 留空,使用内存限流"
  fi

  # ANTHROPIC_BASE_URL（可选）
  read -rp "  ANTHROPIC_BASE_URL (中转代理,留空走官方): " ANTHROPIC_BASE_URL_INPUT < "${TTY_IN}"
  if [[ -n "${ANTHROPIC_BASE_URL_INPUT}" ]]; then
    ok "  ANTHROPIC_BASE_URL = ${ANTHROPIC_BASE_URL_INPUT}"
  else
    ok "  ANTHROPIC_BASE_URL 留空,走 https://api.anthropic.com"
  fi
  echo
fi

# ============================================================
# 4. clone 仓库到 /tmp（用于拿 setup.sh 与 templates）
# ============================================================
log "Step 1/6: 准备脚本"

WORK_DIR="/tmp/emotion-bootstrap-$$"
mkdir -p "${WORK_DIR}"
trap 'rm -rf "${WORK_DIR}"' EXIT

# 临时安装 git（如果还没装）以便 clone
if ! command -v git >/dev/null 2>&1; then
  log "  系统没有 git,临时安装"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y git >/dev/null
fi

log "  clone ${REPO_URL} (branch=${BRANCH})"
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${WORK_DIR}/repo" >/dev/null 2>&1
ok "  脚本已下载到 ${WORK_DIR}/repo"

# ============================================================
# 5. 生成 config.sh
# ============================================================
log "Step 2/6: 生成 scripts/vps/config.sh"

cat > "${WORK_DIR}/repo/scripts/vps/config.sh" <<EOF
#!/usr/bin/env bash
# 由 bootstrap.sh 自动生成
REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
APP_USER="${APP_USER}"
APP_DIR="${APP_DIR}"
API_DOMAIN="${API_DOMAIN}"
ACME_EMAIL="${ACME_EMAIL}"
SERVICE_NAME="${SERVICE_NAME}"
NODE_PORT="${NODE_PORT}"
EOF
ok "  config.sh 已生成"

# ============================================================
# 6. 跑 setup.sh
# ============================================================
log "Step 3/6: 调用 setup.sh（装依赖 / systemd / Nginx / certbot）"
echo "------------------------------------------------------------"
# setup.sh 末尾会因为 .env 占位符未填而提示并不启动服务,这里我们后面会接管
bash "${WORK_DIR}/repo/scripts/vps/setup.sh" || {
  err "setup.sh 失败,bootstrap 中断"
  exit 1
}
echo "------------------------------------------------------------"

# ============================================================
# 7. 安全地把 secret 写入 .env（不用 sed,避免特殊字符）
# ============================================================
if [[ ! -f "${ENV_FILE}" ]]; then
  err "${ENV_FILE} 不存在,setup.sh 失败了？"
  exit 1
fi

if [[ "${SKIP_SECRETS}" == "false" ]]; then
  log "Step 4/6: 把 secret 写入 ${ENV_FILE}"

  # 用 bash 逐行替换,完全避开 sed 的转义地狱
  update_env_var() {
    local key="$1" val="$2" file="$3"
    local tmp; tmp="$(mktemp)"
    local replaced=false
    while IFS= read -r line || [[ -n "${line}" ]]; do
      if [[ "${line}" == "${key}="* ]]; then
        printf '%s=%s\n' "${key}" "${val}"
        replaced=true
      else
        printf '%s\n' "${line}"
      fi
    done < "${file}" > "${tmp}"
    if [[ "${replaced}" == "false" ]]; then
      printf '%s=%s\n' "${key}" "${val}" >> "${tmp}"
    fi
    mv "${tmp}" "${file}"
  }

  update_env_var "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY_INPUT}" "${ENV_FILE}"
  update_env_var "DATABASE_URL" "${DATABASE_URL_INPUT}" "${ENV_FILE}"
  update_env_var "CORS_ORIGIN" "${CORS_ORIGIN_INPUT}" "${ENV_FILE}"

  if [[ -n "${REDIS_URL_INPUT}" ]]; then
    update_env_var "REDIS_URL" "${REDIS_URL_INPUT}" "${ENV_FILE}"
  fi
  if [[ -n "${ANTHROPIC_BASE_URL_INPUT}" ]]; then
    update_env_var "ANTHROPIC_BASE_URL" "${ANTHROPIC_BASE_URL_INPUT}" "${ENV_FILE}"
  fi

  # 确保权限
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  ok "  ${ENV_FILE} 已更新"
fi

# 二次校验：还有占位符就拒绝继续
if grep -qE '__FILL_ME__|__YOUR_FRONTEND_DOMAIN__|__JWT_SECRET_PLACEHOLDER__' "${ENV_FILE}"; then
  err ".env 中仍存在占位符,无法启动服务："
  grep -nE '__FILL_ME__|__YOUR_FRONTEND_DOMAIN__|__JWT_SECRET_PLACEHOLDER__' "${ENV_FILE}" | sed 's/^/    /'
  err "请手动修复后再跑一次 bootstrap.sh"
  exit 1
fi

# ============================================================
# 8. 启动服务
# ============================================================
log "Step 5/6: 启动 ${SERVICE_NAME}"

systemctl restart "${SERVICE_NAME}"

# 等服务起来
SERVICE_OK=false
for i in 1 2 3 4 5 6 7 8; do
  sleep 1
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    if curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" >/dev/null 2>&1; then
      SERVICE_OK=true
      break
    fi
  fi
done

if [[ "${SERVICE_OK}" != "true" ]]; then
  err "服务未在 8 秒内起来,看一下日志："
  echo
  journalctl -u "${SERVICE_NAME}" -n 50 --no-pager
  exit 1
fi
ok "  ${SERVICE_NAME} 已运行"

# ============================================================
# 9. 跑数据库迁移
# ============================================================
log "Step 6/6: 运行数据库迁移（幂等）"
if sudo -u "${APP_USER}" -H bash -lc "cd '${APP_DIR}' && pnpm --filter @emotion/api run db:migrate" 2>&1 | tail -20; then
  ok "  迁移完成"
else
  warn "  迁移失败,但服务已启动。可以稍后手动重试："
  warn "    sudo -u ${APP_USER} -H bash -lc \"cd ${APP_DIR} && pnpm --filter @emotion/api run db:migrate\""
fi

# ============================================================
# 10. 完成横幅
# ============================================================
HEALTH="$(curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" 2>/dev/null || echo '{}')"
EXTERNAL_HEALTH="$(curl -fsS "https://${API_DOMAIN}/api/health" 2>/dev/null || echo '')"

echo
echo -e "${C_GREEN}${C_BOLD}╔══════════════════════════════════════════════════════════════╗"
echo -e "║                     🎉  部署完成                              ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${C_RESET}"
echo
echo -e "  ${C_BOLD}域名${C_RESET}        https://${API_DOMAIN}"
echo -e "  ${C_BOLD}本地健康${C_RESET}    ${HEALTH}"
if [[ -n "${EXTERNAL_HEALTH}" ]]; then
  echo -e "  ${C_BOLD}外部健康${C_RESET}    ${EXTERNAL_HEALTH:0:200}..."
fi
echo
echo -e "  ${C_BOLD}查日志${C_RESET}      sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "  ${C_BOLD}重启${C_RESET}        sudo systemctl restart ${SERVICE_NAME}"
echo -e "  ${C_BOLD}改 .env${C_RESET}     sudo nano ${ENV_FILE}"
echo
echo -e "  ${C_BOLD}后续更新${C_RESET}    sudo -u ${APP_USER} -H bash ${APP_DIR}/scripts/vps/deploy.sh"
echo -e "                或在 VPS 上 \`git pull\` 之后:"
echo -e "                bash ${APP_DIR}/scripts/vps/deploy.sh"
echo
echo -e "${C_BOLD}下一步：${C_RESET}"
echo "  1. 浏览器打开 https://${API_DOMAIN}/api/health 应能看到 JSON"
echo "  2. 在 Vercel 部署前端,设 VITE_API_BASE_URL=https://${API_DOMAIN}"
if [[ "${CORS_ORIGIN_INPUT}" == *"placeholder"* ]] || [[ "${CORS_ORIGIN_INPUT}" == *"example"* ]]; then
  echo
  echo -e "${C_YELLOW}  ⚠️  你的 CORS_ORIGIN 看起来是占位符,部完前端后请回来改：${C_RESET}"
  echo "     sudo nano ${ENV_FILE}"
  echo "     # 改 CORS_ORIGIN= 为 Vercel 真实域名"
  echo "     sudo systemctl restart ${SERVICE_NAME}"
fi
echo
