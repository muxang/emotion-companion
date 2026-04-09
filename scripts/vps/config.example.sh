#!/usr/bin/env bash
# ============================================================
# VPS 部署配置
# ============================================================
# 1. 复制本文件为 config.sh：cp config.example.sh config.sh
# 2. 编辑 config.sh，按你自己的情况填写下面的值
# 3. 不要把 config.sh 提交到 git（已加入 .gitignore）
#
# 这里只放非密钥配置；真正的密钥（ANTHROPIC_API_KEY / DATABASE_URL /
# JWT_SECRET 等）由 setup.sh 写到 apps/api/.env，由你登录 VPS 后用
# nano 编辑填进去。
# ============================================================

# 你的 git 仓库地址（HTTPS 或 SSH 都行；如果是私库 SSH 要先把 VPS 的
# 公钥加到 git 平台 deploy keys）
REPO_URL="https://github.com/your-username/your-repo.git"

# 要部署的分支
BRANCH="main"

# VPS 上跑服务的 Linux 用户名（不需要存在，setup.sh 会自动创建）
APP_USER="emotion"

# 应用根目录（代码会被 clone 到这里）
APP_DIR="/home/${APP_USER}/emotion"

# 后端的对外域名（必须已经配好 A 记录指向本 VPS）
# 例如：api.emotion.example.com
API_DOMAIN="api.example.com"

# certbot 申请 HTTPS 证书时用的邮箱（接收续期失败提醒）
ACME_EMAIL="you@example.com"

# 系统服务名（用于 systemctl，一般不用改）
SERVICE_NAME="emotion-api"

# Node 监听端口（只在 127.0.0.1 上）
NODE_PORT="3000"

# ---- Admin API ----
ADMIN_SERVICE_NAME="emotion-admin-api"
ADMIN_PORT="3001"
