#!/usr/bin/env bash
# ============================================================
# Emotion Companion - 增量更新脚本
# ============================================================
# 用法（在 VPS 上）：
#   bash scripts/vps/deploy.sh
#
# 流程：
#   1. git pull
#   2. pnpm install --frozen-lockfile
#   3. 构建 apps/api
#   4. 跑一次数据库迁移（幂等，已应用的会跳过）
#   5. sudo systemctl restart <service>
#   6. 等 2 秒，curl /api/health 自检
# ============================================================

set -euo pipefail

C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_BLUE='\033[0;34m'
C_RESET='\033[0m'

log()  { echo -e "${C_BLUE}[deploy]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[ ok  ]${C_RESET} $*"; }
err()  { echo -e "${C_RED}[ err ]${C_RESET} $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.sh"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  err "找不到 ${CONFIG_FILE}"
  err "请先：cp ${SCRIPT_DIR}/config.example.sh ${CONFIG_FILE} && nano ${CONFIG_FILE}"
  exit 1
fi
# shellcheck source=/dev/null
source "${CONFIG_FILE}"

# 当前用户必须是 APP_USER（避免 root pull 留下 root-owned 文件）
CURRENT_USER="$(id -un)"
if [[ "${CURRENT_USER}" != "${APP_USER}" ]]; then
  err "请以 ${APP_USER} 身份运行（你现在是 ${CURRENT_USER}）"
  err "  sudo -u ${APP_USER} -H bash ${SCRIPT_DIR}/deploy.sh"
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  err "${APP_DIR} 不是一个 git 仓库，请先跑一次 setup.sh"
  exit 1
fi

cd "${APP_DIR}"

# ---------- Step 1: git pull ----------
log "Step 1/5: git pull (${BRANCH})"
git fetch origin "${BRANCH}"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/${BRANCH}")
if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  ok "  已经是最新（${LOCAL:0:7}）"
else
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  ok "  ${LOCAL:0:7} → $(git rev-parse --short HEAD)"
fi

# ---------- Step 2: pnpm install ----------
log "Step 2/5: pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

# ---------- Step 3: typecheck (生产用 tsx 直接跑 .ts,无需单独 build) ----------
log "Step 3/5: typecheck"
if pnpm --filter @emotion/api run typecheck >/dev/null 2>&1; then
  ok "  typecheck 通过"
else
  err "  typecheck 有报错,先在本地修好再 push"
  pnpm --filter @emotion/api run typecheck || true
  exit 1
fi

# ---------- Step 4: db migrate ----------
log "Step 4/5: db migrate（幂等）"
if pnpm --filter @emotion/api run db:migrate; then
  ok "  迁移完成"
else
  err "  迁移失败，请检查 DATABASE_URL 与日志"
  exit 1
fi

# ---------- Step 5: restart service + 健康检查 ----------
log "Step 5/5: 重启 ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

# 等服务起来
for i in 1 2 3 4 5; do
  sleep 1
  if curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  if [[ $i -eq 5 ]]; then
    err "服务未在 5 秒内响应 /api/health"
    err "查看日志：sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    exit 1
  fi
done

HEALTH="$(curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" || true)"
echo
ok "==============================================================="
ok " 部署完成 ✅  ($(date '+%Y-%m-%d %H:%M:%S'))"
ok " commit  : $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"
ok " health  : ${HEALTH}"
ok ""
ok " 实时日志：sudo journalctl -u ${SERVICE_NAME} -f"
ok "==============================================================="
