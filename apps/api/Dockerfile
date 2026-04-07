# Phase 7：API 生产镜像
#
# 多阶段构建：
#  1. deps   - 装 monorepo 全部依赖（pnpm + workspace）
#  2. build  - 编译 TypeScript，生成 dist
#  3. runner - 仅复制 dist + node_modules，最终镜像精简
#
# 构建上下文必须是仓库根目录：
#   docker build -f apps/api/Dockerfile -t emotion-companion-api .

# ---- 1. deps ----
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

# ---- 2. build ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo /repo
RUN pnpm --filter @emotion/api... build

# ---- 3. runner ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# 仅 root 安装 wget 用于 healthcheck，运行时切到非 root 用户
RUN apk add --no-cache wget && addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001 -G nodejs

COPY --from=build --chown=nodeuser:nodejs /repo/apps/api/dist ./dist
COPY --from=build --chown=nodeuser:nodejs /repo/apps/api/package.json ./package.json
COPY --from=build --chown=nodeuser:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodejs /repo/packages ./packages

USER nodeuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
