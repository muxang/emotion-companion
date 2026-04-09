# Emotion Companion · 系统架构总览

> 最后更新：2026-04-09（Phase 7+ 维护期：智能融合层 ActionCard 持久化 + 详细架构图集）
>
> 本文档面向**开发者 / 运维 / 接手维护的人**，目标是让任何人在 30 分钟内掌握这个项目的全貌、可以独立排查线上问题、可以独立做小幅迭代。
>
> 如果你是第一次看，建议按顺序读完目录。

---

## 目录

1. [产品定位与边界](#一产品定位与边界)
2. [技术栈](#二技术栈)
3. [系统架构与部署拓扑](#三系统架构与部署拓扑)
   - 3.1 [部署拓扑（物理视图）](#31-部署拓扑物理视图)
   - 3.2 [后端进程内部架构](#32-后端进程内部架构)
   - 3.3 [Monorepo 包依赖关系](#33-monorepo-包依赖关系)
   - 3.4 [请求生命周期：POST /api/chat/stream](#34-请求生命周期post-apichatstream)
   - 3.5 [智能融合层 ActionCard 数据流](#35-智能融合层-actioncard-数据流)
   - 3.6 [数据库 ER 简图](#36-数据库-er-简图)
   - 3.7 [Orchestrator 决策状态机](#37-orchestrator-决策状态机)
4. [Monorepo 目录结构](#四monorepo-目录结构)
5. [数据库 Schema](#五数据库-schema)
6. [API 接口清单](#六api-接口清单)
7. [前端页面与路由](#七前端页面与路由)
8. [对话编排（Orchestrator）核心流程](#八对话编排orchestrator核心流程)
9. [Skills 系统](#九skills-系统)
10. [Safety 与 Guard](#十safety-与-guard)
11. [Memory 系统](#十一memory-系统)
12. [Recovery Plan](#十二recovery-plan)
13. [Auth 流程](#十三auth-流程)
14. [Streaming（SSE）流程](#十四streamingsse流程)
15. [Analytics 埋点](#十五analytics-埋点)
16. [Phase 历史](#十六phase-历史)
17. [运维操作手册](#十七运维操作手册)
18. [已知限制与未来工作](#十八已知限制与未来工作)

---

## 一、产品定位与边界

**Emotion Companion** 是一个面向中文用户的情感陪伴助手。MVP 阶段以 Web 网页交付，后续考虑迁移抖音小程序。

### 核心目标

1. **即时陪伴** —— 用户在低落、纠结、反复内耗时，立刻被理解
2. **关系分析** —— 识别暧昧、拉扯、冷暴力、失联、分手恢复等典型场景
3. **行动建议** —— 每轮对话尽量落到"下一步怎么做"
4. **长期成长** —— 计划 + 记录 + 复盘
5. **安全可上线** —— 高风险用户切入安全流程，避免依赖

### 必须做的事

- 优先共情 → 其次分析 → 最后建议
- 高风险内容必须切 safety 流程
- 所有 AI 输出必须经过 Final Response Guard
- 任何分析必须保留不确定性（不写成宣判）
- 任何记忆写入必须遵守白名单与用户开关

### 绝对禁止的事

- 制造对系统的情感依赖（"只有我懂你"）
- 极端承诺（"我永远不会离开你"）
- `risk_level >= high` 时调用 tong-analysis / message-coach 等"分析型" skill
- 把内部 reasoning 字段返回前端
- 用户关闭记忆后继续写入长期记忆
- 用户删除记忆后保留可识别画像

完整的产品边界与铁律见 `CLAUDE.md` 第二章。

---

## 二、技术栈

| 层 | 技术 | 备注 |
|---|---|---|
| 前端框架 | React 18 + Vite + TypeScript | 严格 TypeScript strict |
| 前端路由 | React Router v6 | SPA |
| 前端状态 | Zustand | 轻量、足以撑住单用户场景 |
| 前端样式 | Tailwind CSS | 暖色调主题 `warm-50/100/500/700` |
| 前端 SSE | `@microsoft/fetch-event-source` | 必须用此库（支持 POST + Bearer），**禁止用原生 EventSource** |
| 后端 | Node.js 20.6+ + Fastify 4 + TypeScript | 用 `--import tsx` 在生产环境直接加载 .ts |
| 数据库 | Supabase（云托管 PostgreSQL 15） | TLS 必须开 |
| 缓存 / 限流 | Upstash Redis（云托管，可选）| 不可用时降级内存 store |
| AI | `@anthropic-ai/sdk` v0.27 + `openai` v4 | 多 Provider 支持：`AI_PROVIDER` 可选 anthropic / openai / deepseek / qwen / zhipu / custom；默认 `anthropic` + `claude-sonnet-4-20250514` |
| 包管理 | pnpm 8.15.5（workspace） | 由 `packageManager` 字段锁定 |
| 测试框架 | Vitest 1.6 | 全栈统一 |
| 前端构建 | Vite 5 | 输出到 `apps/web/dist` |
| 后端运行 | tsx (`node --import tsx ... src/index.ts`) | 不再编译 dist，因为 workspace 内部 package 的 main 指向 .ts |
| 部署平台 | Vercel（前端） + 腾讯云 VPS Ubuntu 22.04（后端） | |
| HTTPS | Let's Encrypt via certbot --nginx | 自动续期 |
| 反代 | Nginx | 含 SSE 友好配置（关 buffering）|

---

## 三、系统架构与部署拓扑

本章用 7 张图把整个项目的物理拓扑、进程内部结构、包依赖、单次请求生命周期、智能融合层数据流、数据库关系、编排状态机讲清楚。**对架构有疑问时，先在这里找答案，再去看代码**。

### 3.1 部署拓扑（物理视图）

四层视角：客户端 / 边缘 / 应用 / 数据 + 外部 AI Provider。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端层 (Client)                                │
│                                                                              │
│      ┌────────────────────┐               ┌────────────────────┐             │
│      │  浏览器 (Chrome /  │               │  浏览器移动端       │             │
│      │  Safari / Firefox) │               │  (iOS / Android)   │             │
│      └─────────┬──────────┘               └─────────┬──────────┘             │
│                │   localStorage:                    │                        │
│                │     emotion.anonymous_id           │                        │
│                │     emotion.token (JWT)            │                        │
└────────────────┼─────────────────────────────────────┼───────────────────────┘
                 │                                     │
                 │  HTTPS  ┌──────────────────────┐    │  HTTPS
                 │ (静态)  │ 请求路由              │    │ (API)
                 ▼         │  - 静态资源 → Vercel  │    ▼
┌─────────────────────────┐│  - /api/* → VPS      │┌─────────────────────────┐
│       边缘层 (Edge)      ││ (前端 fetch 直接走  ││      边缘层 (Edge)       │
│                          ││  api.botjive.net)    ││                          │
│  ┌────────────────────┐  │└──────────────────────┘│  ┌────────────────────┐  │
│  │  Vercel Global CDN │  │                        │  │ Cloudflare DNS     │  │
│  │  apps/web 静态构建 │  │                        │  │ (grey cloud / DNS) │  │
│  │  *.vercel.app +    │  │                        │  │ A 记录:            │  │
│  │  自定义域名        │  │                        │  │ api.botjive.net    │  │
│  └────────────────────┘  │                        │  │  → VPS IPv4         │  │
│                          │                        │  └─────────┬──────────┘  │
└──────────────────────────┘                        └────────────┼─────────────┘
                                                                  │ TCP/443
                                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          应用层 (App, 腾讯云 VPS Ubuntu 22.04)                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Nginx 1.22  (TLS termination + 反代 + SSE 优化)                          │ │
│  │   - HTTPS 443 (Let's Encrypt, certbot 自动续期)                          │ │
│  │   - location /api/ → http://127.0.0.1:3000                              │ │
│  │   - SSE 路径关闭 buffering: proxy_buffering off; proxy_read_timeout 600s│ │
│  │   - access.log / error.log → /var/log/nginx/                            │ │
│  └────────────────────────────────────┬───────────────────────────────────┘ │
│                                       │ 127.0.0.1:3000                       │
│  ┌────────────────────────────────────▼───────────────────────────────────┐ │
│  │ systemd unit: emotion-api.service                                       │ │
│  │   ExecStart=node --import tsx apps/api/src/index.ts                     │ │
│  │   Restart=on-failure  RestartSec=5                                      │ │
│  │   User=emotion        WorkingDirectory=/home/emotion/emotion            │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │   │ Node 20 + tsx loader  →  Fastify 4 (HTTP/1.1)                    │  │ │
│  │   │   plugins:    @fastify/cors, @fastify/jwt, @fastify/rate-limit  │  │ │
│  │   │   middleware: requireAuth (JWT 校验 + 用户挂载)                   │  │ │
│  │   │   routes:     auth / sessions / chat-stream(SSE) / analysis /    │  │ │
│  │   │               recovery / memory / settings / health               │  │ │
│  │   │   依赖注入:   AIClient + Repos + Memory + Tracker + Logger        │  │ │
│  │   └─────────────────────────────────────────────────────────────────┘  │ │
│  └─────┬──────────────────────────────────────────────────────────┬───────┘ │
└────────┼──────────────────────────────────────────────────────────┼─────────┘
         │ TLS                                                       │ TLS
         │                                                           │
         ▼                                                           ▼
┌─────────────────────────┐                          ┌─────────────────────────┐
│       数据层 (Data)      │                          │      外部 AI Provider     │
│                          │                          │                          │
│  ┌────────────────────┐  │                          │  由 AI_PROVIDER 决定:    │
│  │ Supabase Postgres  │  │                          │                          │
│  │ 15.x 云托管         │  │                          │  ┌──────────────────┐   │
│  │ ────────────────── │  │                          │  │ anthropic (默认) │   │
│  │ users / sessions   │  │                          │  │ api.anthropic.com│   │
│  │ messages           │  │                          │  │ Claude Sonnet 4  │   │
│  │ user_profiles      │  │                          │  └──────────────────┘   │
│  │ relationship_*     │  │                          │  ┌──────────────────┐   │
│  │ memory_summaries   │  │                          │  │ openai-compat:   │   │
│  │ recovery_plans     │  │                          │  │  - openai        │   │
│  │ recovery_checkins  │  │                          │  │  - deepseek      │   │
│  │ analytics_events   │  │                          │  │  - qwen (通义)   │   │
│  └────────────────────┘  │                          │  │  - zhipu (智谱)  │   │
│                          │                          │  │  - custom 中转   │   │
│  ┌────────────────────┐  │                          │  └──────────────────┘   │
│  │ Upstash Redis 7    │  │                          │                          │
│  │ (可选, 云托管)     │  │                          │  失败 / 超时 → AIError   │
│  │ ────────────────── │  │                          │  → orchestrator 走兜底    │
│  │ rate-limit store   │  │                          │     文案，不抛到前端       │
│  │ (不可用时降级为     │  │                          │                          │
│  │  Node 内存 store)  │  │                          │                          │
│  └────────────────────┘  │                          │                          │
└─────────────────────────┘                          └─────────────────────────┘
```

**为什么这样分**：
- **前端纯静态 → CDN 分发**：最便宜最快，全球边缘缓存，无需运维
- **后端必须自己跑**：长连接 SSE + 数据库连接池 + AbortController 资源管理，serverless 不友好
- **数据库托管**：备份、高可用、PITR 都由 Supabase 负责
- **Cloudflare 仅用 DNS**：开 proxy（橙云）会破坏 SSE 长连接，所以保持 grey cloud
- **多 AI Provider**：通过 `AI_PROVIDER` 切换，包依赖只到 `core-ai/factory.ts`，业务代码无感知

---

### 3.2 后端进程内部架构

Node 进程启动到一次请求被处理的内部分层。

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  Node 进程 (apps/api, tsx loader)                          │
│                                                                            │
│  index.ts                                                                  │
│    │                                                                       │
│    │ 1. config/env.ts  (Zod 校验所有环境变量)                                │
│    │ 2. createAIClient(env)  →  packages/core-ai/factory                    │
│    │ 3. getRedisClient(env)  →  apps/api/redis (可选)                       │
│    │ 4. createMemoryService() / createTracker() / createSafetyClassifier() │
│    │ 5. buildApp({ ai, redis, ...deps })                                   │
│    │ 6. app.listen({ host: '0.0.0.0', port: env.PORT })                    │
│    ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ buildApp() — apps/api/src/app.ts                                  │    │
│  │                                                                    │    │
│  │  注册顺序（重要）:                                                  │    │
│  │   ① pino logger                                                    │    │
│  │   ② @fastify/cors  ← 严格匹配 CORS_ORIGIN                          │    │
│  │   ③ @fastify/jwt   ← 注册解码器，不强制 401                        │    │
│  │   ④ @fastify/rate-limit ← 优先 redisStore，缺则内存 store          │    │
│  │   ⑤ requireAuth decorator (req → user 挂载)                       │    │
│  │   ⑥ 注入仓储 + AI + Memory + Tracker 到 fastify.decorate           │    │
│  │   ⑦ routes: auth / sessions / chat-stream / analysis /            │    │
│  │             recovery / memory / settings / health                  │    │
│  │   ⑧ 全局 error handler (中文错误码 → JSON)                          │    │
│  └────────────────────────────────┬─────────────────────────────────┘    │
│                                    │                                       │
│                                    │ HTTP 请求进入                          │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │ 路由层 (apps/api/src/routes/*)                                    │     │
│  │   - 入参用 Zod schema 校验                                         │     │
│  │   - requireAuth 中间件挂载 req.user                                │     │
│  │   - 业务逻辑薄壳，重活全部委托给 orchestrator / services / repos    │     │
│  └────────────────────────────────┬────────────────────────────────┘     │
│                                    │                                       │
│         ┌──────────────────────────┼──────────────────────────┐           │
│         │                          │                          │           │
│         ▼                          ▼                          ▼           │
│  ┌──────────────┐         ┌──────────────────┐       ┌──────────────┐    │
│  │ /chat/stream │         │ /analysis /       │       │ /sessions /  │    │
│  │              │         │  recovery /       │       │  memory /    │    │
│  │ orchestrator │         │  message-coach    │       │  settings /  │    │
│  │ (核心)       │         │  (各自走专用 skill)│       │  health      │    │
│  └──────┬───────┘         └────────┬─────────┘       └──────┬───────┘    │
│         │                          │                         │            │
│         └──────────────────────────┼─────────────────────────┘            │
│                                    │                                       │
│  ┌─────────────────────────────────▼─────────────────────────────────┐   │
│  │ 业务能力层 (packages/*) — 全部纯函数 / 可独立测试                   │   │
│  │                                                                     │   │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌────────────────┐ │   │
│  │  │ skills/    │ │ safety/    │ │ memory/     │ │ core-ai/       │ │   │
│  │  │  emotion-  │ │  classifier│ │  short-term │ │  factory       │ │   │
│  │  │  intake    │ │  ai-       │ │  long-term  │ │  providers/    │ │   │
│  │  │  companion-│ │   classifier│ │  summarizer │ │   anthropic   │ │   │
│  │  │  response  │ │  rules     │ │  timeline   │ │   openai-compat│ │   │
│  │  │  tong-     │ │  triage    │ │             │ │  guard         │ │   │
│  │  │  analysis  │ │  guard     │ │             │ │  stream        │ │   │
│  │  │  message-  │ └─────┬──────┘ └──────┬──────┘ └────────┬───────┘ │   │
│  │  │  coach     │       │               │                 │         │   │
│  │  │  recovery- │       │               │                 │         │   │
│  │  │  plan      │       │               │                 │         │   │
│  │  │  safety-   │       │               │                 │         │   │
│  │  │  triage    │       │               │                 │         │   │
│  │  └─────┬──────┘       │               │                 │         │   │
│  │        │              │               │                 │         │   │
│  │        └──────────────┴───────┬───────┴─────────────────┘         │   │
│  │                                │                                   │   │
│  │                                ▼                                   │   │
│  │                      ┌─────────────────┐                          │   │
│  │                      │  shared/        │                          │   │
│  │                      │  - types        │  ← 所有包都依赖           │   │
│  │                      │  - schemas      │    无业务逻辑              │   │
│  │                      │  - constants    │                          │   │
│  │                      └─────────────────┘                          │   │
│  └─────────────────────────────────┬─────────────────────────────────┘   │
│                                    │                                       │
│  ┌─────────────────────────────────▼─────────────────────────────────┐   │
│  │ 基础设施层 (apps/api/src/db, redis)                                │   │
│  │                                                                     │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │   │
│  │  │ pg.Pool 单例     │  │ ioredis 单例     │  │ pino logger      │ │   │
│  │  │ + repositories/  │  │ + ready 等待     │  │ child logger     │ │   │
│  │  │   users          │  │                  │  │ (按 reqId 隔离)  │ │   │
│  │  │   sessions       │  │                  │  │                  │ │   │
│  │  │   messages       │  │                  │  │                  │ │   │
│  │  │   memory         │  │                  │  │                  │ │   │
│  │  │   recovery       │  │                  │  │                  │ │   │
│  │  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘ │   │
│  └───────────┼─────────────────────┼─────────────────────────────────┘   │
└──────────────┼─────────────────────┼───────────────────────────────────────┘
               │                     │
               ▼                     ▼
        Supabase Postgres      Upstash Redis
```

**关键约束**：
- 路由层只做参数校验和编排调用，不写业务规则
- 业务能力层（packages/*）不依赖 fastify、不依赖 pg.Pool —— 只依赖 `core-ai` 和 `shared`，便于单元测试
- `shared` 是 DAG 的根，不依赖任何其它包；任何业务逻辑都不能塞进 shared
- 数据库访问只能通过 `apps/api/src/db/repositories/*`，业务包不直连 pg

---

### 3.3 Monorepo 包依赖关系

包之间是严格的 DAG（不允许循环依赖），方向都是「下层不知道上层存在」。

```
                    ┌──────────────────┐
                    │  apps/api        │  ← 唯一组装点
                    │  (Fastify 后端)  │     依赖几乎所有 packages
                    └────────┬─────────┘
                             │
            ┌────────────────┼─────────────────┐
            │                │                 │
            ▼                ▼                 ▼
   ┌─────────────────┐ ┌──────────┐  ┌──────────────────┐
   │  packages/      │ │ packages/│  │   packages/      │
   │  skills/*       │ │ safety   │  │   memory         │
   │  ┌────────────┐ │ │          │  │                  │
   │  │ emotion-   │ │ └────┬─────┘  └────────┬─────────┘
   │  │ intake     │ │      │                 │
   │  │ companion- │ │      │                 │
   │  │ response   │ │      │                 │
   │  │ tong-      │ │      │                 │
   │  │ analysis   │ │      │                 │
   │  │ message-   │ │      │                 │
   │  │ coach      │ │      │                 │
   │  │ recovery-  │ │      │                 │
   │  │ plan       │ │      │                 │
   │  │ safety-    │ │      │                 │
   │  │ triage     │ │      │                 │
   │  └─────┬──────┘ │      │                 │
   └────────┼────────┘      │                 │
            │               │                 │
            └───────────────┼─────────────────┤
                            │                 │
                            ▼                 │
                  ┌──────────────────┐        │
                  │ packages/        │        │
                  │ core-ai          │◄───────┘
                  │  - factory       │
                  │  - providers/    │  AI Client 抽象 + Final Response Guard
                  │  - guard         │
                  │  - stream        │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ packages/        │
                  │ shared           │  ← DAG 根，零业务逻辑
                  │  - types         │     纯类型 + Zod schemas + 常量
                  │  - schemas       │
                  │  - constants     │
                  └──────────────────┘
                           ▲
                           │ 仅类型
                           │
                  ┌────────┴─────────┐
                  │  apps/web        │  ← 前端只 import shared 的类型
                  │  (React SPA)     │     不 import 任何业务包
                  └──────────────────┘
```

**禁止跨向依赖**：
- ❌ `shared` 不能 import 任何业务包
- ❌ 业务包之间不能互相 import（例如 `skills/companion-response` 不能 import `skills/tong-analysis`，要复用就抽到 `shared`）
- ❌ `apps/web` 不能 import 任何包含 Node API 的包（如 `core-ai/providers/anthropic`），只能 import `shared` 的类型
- ✅ `apps/api` 是唯一组装点，把所有业务包拼成完整应用

---

### 3.4 请求生命周期：POST /api/chat/stream

一次完整的 SSE 流式对话请求，从浏览器发出到前端渲染完成的全部环节。

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ┌──────────┐  ┌──────────┐
│ 前端     │  │ Nginx    │  │ Fastify  │  │ Orchestrator     │  │ AI       │  │ Postgres │
│ chatStore│  │ :443     │  │ :3000    │  │ + Skills + Guard │  │ Provider │  │          │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  └────┬─────┘  └────┬─────┘
     │             │             │                  │                  │             │
     │ POST /api/chat/stream                        │                  │             │
     │ Bearer JWT                                                                     │
     │ {session_id, content}                                                          │
     ├────────────►│             │                  │                  │             │
     │             │ proxy_pass                                                       │
     │             ├────────────►│                  │                  │             │
     │             │             │ requireAuth                                        │
     │             │             │ Zod 校验 body                                      │
     │             │             │ 取 session / 拉最近 6 条历史                       │
     │             │             ├─────────────────────────────────────────────────►│
     │             │             │                  │                  │             │
     │             │             │ orchestrate(input, deps)                          │
     │             │             ├─────────────────►│                  │             │
     │             │             │                  │                                │
     │             │             │ Step 1: emotion-intake (非流式 JSON)               │
     │             │             │                  ├─────────────────►│             │
     │             │             │                  │◄─────────────────┤             │
     │             │             │                  │ IntakeResult                   │
     │             │             │                  │                                │
     │             │             │ Step 2-4: 风险计算 + 脆弱缓冲 → mode 决策          │
     │             │             │                  │                                │
     │             │ thinking 事件                  │                                │
     │             │◄─────────────                  │                                │
     │◄────────────┤             │                  │                                │
     │ 前端显示「正在理解你说的话...」                                                  │
     │             │             │                  │                                │
     │             │             │ Step 5: 智能融合层                                 │
     │             │             │                  │ readIntent(intake)            │
     │             │             │                  │ → push pendingActions[]        │
     │             │             │                  │   (analysis_result/coach_result│
     │             │             │                  │    /plan_created/...)          │
     │             │             │                  │                                │
     │             │             │ Step 6: 模式路由 → 预运行 skill                    │
     │             │             │                  │ analysis: runTongAnalysis     │
     │             │             │                  │ coach:    runMessageCoach     │
     │             │             │                  │ companion:companion stream    │
     │             │             │                  ├─────────────────►│             │
     │             │             │                  │   AI 调用 (4096 tokens)        │
     │             │             │                  │◄─────────────────┤             │
     │             │             │                  │   raw text                     │
     │             │             │                  │                                │
     │             │             │                  │ parser → AnalysisResult        │
     │             │             │                  │ (失败则截断抢救 → 0.3 confidence)│
     │             │             │                  │ 设 skipTextReplay=true        │
     │             │             │                  │                                │
     │             │ meta 事件                      │                                │
     │             │◄─────────────                  │                                │
     │◄────────────┤             │ {mode, risk_level}                                │
     │             │             │                  │                                │
     │             │             │ Step 7: 注入长期记忆 + active plan 状态            │
     │             │             │                  ├─────────────────────────────►│
     │             │             │                  │  getUserMemory                 │
     │             │             │                  │◄─────────────────────────────┤
     │             │             │                  │                                │
     │             │             │ Step 8: 收集 skill 输出到 buffer                   │
     │             │             │                  │ companion: collectStream       │
     │             │             │                  │ analysis/coach: 复用预运行     │
     │             │             │                  │                                │
     │             │             │ Step 9: Final Response Guard                       │
     │             │             │                  │ sanitizeForGuard 清洗          │
     │             │             │                  │ 七项检查同步执行               │
     │             │             │                  │   - no_absolute_promise        │
     │             │             │                  │   - no_dependency_suggestion   │
     │             │             │                  │   - no_verdict_as_analysis     │
     │             │             │                  │   - has_actionable_suggestion  │
     │             │             │                  │   - no_excessive_bonding       │
     │             │             │                  │   - critical_has_real_help     │
     │             │             │                  │   - no_dangerous_content       │
     │             │             │                  │ 失败 → 重试 1 次                │
     │             │             │                  │                                │
     │             │             │ Step 10: sanitizeText (U+FFFD + 控制字符)          │
     │             │             │                  │                                │
     │             │             │ Step 11: 写 messages 表                             │
     │             │             │                  │ user 消息 + assistant 消息     │
     │             │             │                  │ skipTextReplay 时 content =    │
     │             │             │                  │   '[关系分析结果见上方卡片]'   │
     │             │             │                  │ structured_json 含 _actionCard │
     │             │             │                  ├─────────────────────────────►│
     │             │             │                  │◄─────────────────────────────┤
     │             │             │                  │                                │
     │             │             │ Step 12: yield action 事件 + 文字回放               │
     │             │             │                  │                                │
     │             │ action 事件 (analysis_result / coach_result / ...)               │
     │             │◄─────────────                  │                                │
     │◄────────────┤             │                                                   │
     │ chatStore.onAction → ChatViewMessage.actionCard                                 │
     │ ActionCardRenderer 立即渲染卡片                                                  │
     │             │             │                                                   │
     │             │             │ skipTextReplay=false:                              │
     │             │             │   replayChunks(finalText) 切 2-6 字符               │
     │             │ delta 事件 × N                                                    │
     │             │◄─────────────                  │                                │
     │◄────────────┤             │                                                   │
     │ MessageBubble 流式追加文字                                                       │
     │             │             │                                                   │
     │             │             │ Step 13: fire-and-forget 异步                       │
     │             │             │   generateSessionSummary (memory 启用 + risk<high) │
     │             │             │   extractAndSaveEntities                           │
     │             │             │                  ├─────────────────►│             │
     │             │             │                                                    │
     │             │ done 事件 {metadata}                                              │
     │             │◄─────────────                  │                                │
     │◄────────────┤             │                                                   │
     │ chatStore.onDone → status='idle'                                                │
     │ thinkingMessage = null                                                         │
     │             │             │                                                   │
     ▼             ▼             ▼                  ▼                  ▼             ▼
```

**关键时序保证**：
- `meta` 事件总在 `delta` / `action` 之前（前端用它确定本轮模式与 risk）
- `action` 事件总在 `delta` 之前 yield（前端先把卡片骨架渲染出来，再追加文字）
- abort 时：user 消息一定写入，assistant 消息一定不写入
- 异步任务（Step 13）失败仅 warn，不影响响应

---

### 3.5 智能融合层 ActionCard 数据流

ActionCard 既要支持流式新建（实时推 SSE），又要支持刷新页面后从 DB 重建。两条路径必须严格一致，否则会出现"刷新前显示卡片、刷新后变成纯文字"的 bug。

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            生成阶段（Backend）                              │
│                                                                            │
│   IntakeResult.intent                                                      │
│        │                                                                   │
│        ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐    │
│   │ orchestrator/index.ts  Step 5 智能融合层                           │    │
│   │                                                                    │    │
│   │  intent === 'request_analysis'  →  mode='analysis' →  Step 6      │    │
│   │  intent === 'message_coach'     →  mode='coach'    →  Step 6      │    │
│   │  intent === 'create_plan'(明确)  →  createPlan + push 'plan_created'│    │
│   │  intent === 'create_plan'(模糊)  →  push 'plan_options' + 引导文案 │    │
│   │  intent === 'checkin'           →  completeCheckin + push         │    │
│   │                                     'checkin_done' + 致意文案     │    │
│   │                                                                    │    │
│   │  pendingActions: PendingAction[] = [...]                          │    │
│   └────────────────────────┬────────────────────────────────────────┘    │
│                            │                                              │
│        ┌───────────────────┴────────────────────┐                         │
│        │                                        │                         │
│        ▼                                        ▼                         │
│   ┌─────────────────┐                    ┌─────────────────────────┐     │
│   │ Step 12         │                    │ Step 11 持久化           │     │
│   │ SSE yield       │                    │ messages.append({       │     │
│   │  type='action'  │                    │   content: skipTextReplay│     │
│   │  action_type    │                    │     ? '[占位符]'         │     │
│   │  payload        │                    │     : finalText,         │     │
│   │                 │                    │   structured_json: {    │     │
│   │ 给前端流式新建   │                    │     ...baseStructured,  │     │
│   │ 用的实时通道     │                    │     _actionCard: {      │     │
│   │                 │                    │       action_type,      │     │
│   │                 │                    │       payload           │     │
│   │                 │                    │     }                   │     │
│   │                 │                    │   }                     │     │
│   │                 │                    │ })                      │     │
│   └────────┬────────┘                    └──────────┬──────────────┘     │
└────────────┼────────────────────────────────────────┼───────────────────┘
             │                                        │
             │ SSE 'action' event                     │
             │                                        ▼
             │                              ┌─────────────────────┐
             │                              │ Postgres            │
             │                              │ messages.           │
             │                              │  structured_json    │
             │                              │  ._actionCard       │
             │                              └──────────┬──────────┘
             │                                         │
             │                                         │
             │                          ┌──────────────┴──────────────┐
             │                          │                             │
             │                          │ GET /api/sessions/:id        │
             │                          │ 加载历史消息                  │
             │                          │ MessageDTO[]                 │
             │                          │   (含 structured_json)       │
             │                          │                             │
             ▼                          ▼                             │
┌──────────────────────────────────────────────────────────────────┐ │
│                       前端 chatStore                               │ │
│                                                                    │ │
│  ┌─────────────────────┐         ┌─────────────────────────────┐ │ │
│  │ 流式路径             │         │ Hydrate 路径                  │ │ │
│  │                     │         │                              │ │ │
│  │ onAction(type, p)   │         │ hydrateFromDb(sid, dtos)     │ │ │
│  │  → 给当前 streaming  │         │  filtered = dtos.filter(    │ │ │
│  │    的 assistantMsg  │         │    role ∈ {user,assistant}) │ │ │
│  │    挂 actionCard    │         │  lastIndex = filtered.length-1│ │ │
│  │  → 不设置           │         │  for (m, i) of filtered:    │ │ │
│  │    isLastMessage    │         │    if m.role==='assistant'  │ │ │
│  │    (默认 true)      │         │       && structured_json:   │ │ │
│  │                     │         │       const raw = sj         │ │ │
│  │                     │         │         ._actionCard         │ │ │
│  │                     │         │       view.actionCard = {   │ │ │
│  │                     │         │         id, action_type,     │ │ │
│  │                     │         │         payload, createdAt, │ │ │
│  │                     │         │         isLastMessage:       │ │ │
│  │                     │         │           i === lastIndex   │ │ │
│  │                     │         │       }                      │ │ │
│  └──────────┬──────────┘         └──────────────┬──────────────┘ │ │
│             │                                    │                │ │
│             └──────────────┬─────────────────────┘                │ │
│                            │                                       │ │
│                            ▼                                       │ │
│              ChatViewMessage.actionCard                            │ │
│                            │                                       │ │
└────────────────────────────┼───────────────────────────────────────┘ │
                             │                                         │
                             ▼                                         │
              ┌──────────────────────────────┐                        │
              │ MessageBubble                 │                        │
              │   ↓                           │                        │
              │ ActionCardRenderer            │                        │
              │   switch (action_type) {      │                        │
              │     'analysis_result' →       │                        │
              │       <AnalysisResultCard>    │                        │
              │     'coach_result' →          │                        │
              │       <CoachResultCard>       │                        │
              │     'plan_created' →          │                        │
              │       <PlanCreatedCard>       │                        │
              │     'plan_options' →          │                        │
              │       <PlanOptionsCard        │                        │
              │         isLastMessage={...}/> │                        │
              │     'checkin_done' →          │                        │
              │       <CheckinDoneCard>       │                        │
              │   }                           │                        │
              └──────────────────────────────┘                        │
                                                                       │
                              ◄────────────────────────────────────────┘
                              页面刷新时走 hydrate 路径
```

**两条路径的差异**（容易踩的坑）：
- **流式路径** 通过 SSE `onAction` 拿到卡片，`isLastMessage` 默认 true（用户刚选完计划就发消息）
- **Hydrate 路径** 从 DB 拿到 `_actionCard`，按 `i === lastIndex` 写 `isLastMessage`，避免历史 plan_options 卡片让用户重复点击
- 两条路径写出来的 `ChatViewMessage.actionCard` 形状必须一致，否则 ActionCardRenderer 会渲染崩掉

---

### 3.6 数据库 ER 简图

只画核心表与外键，不展开字段。完整 schema 见 [§ 五、数据库 Schema](#五数据库-schema)。

```
                              ┌─────────────────┐
                              │     users       │
                              │  ─────────────  │
                              │ id (PK)         │
                              │ anonymous_id    │
                              │ memory_enabled  │
                              │ tone_preference │
                              │ ...             │
                              └────────┬────────┘
                                       │ 1
              ┌─────────────────┬──────┼──────┬─────────────────┬──────────────┐
              │                 │      │      │                 │              │
              │ N               │ N    │ N    │ N               │ N            │ N
              ▼                 ▼      ▼      ▼                 ▼              ▼
    ┌──────────────────┐ ┌──────────────┐ ┌────────────────┐ ┌─────────────┐ ┌─────────────┐
    │    sessions      │ │ user_profile │ │ relationship_  │ │ memory_     │ │ recovery_   │
    │ ─────────────── │ │ (1 对 1)     │ │ entities       │ │ summaries   │ │ plans       │
    │ id (PK)         │ │ ──────────── │ │ ──────────────│ │ ────────── │ │ ──────────  │
    │ user_id (FK)    │ │ traits_json  │ │ id (PK)        │ │ id (PK)     │ │ id (PK)     │
    │ title           │ │ updated_at   │ │ user_id (FK)   │ │ user_id(FK) │ │ user_id(FK) │
    │ message_count   │ └──────────────┘ │ label          │ │ session_id  │ │ plan_type   │
    │ created_at      │                  │ relation_type  │ │  (FK)       │ │ current_day │
    └────────┬─────────┘                  │ updated_at     │ │ summary_text│ │ status      │
             │ 1                          └────────┬───────┘ └─────────────┘ │ created_at  │
             │ N                                   │ 1                       └──────┬──────┘
             ▼                                     │ N                              │ 1
    ┌──────────────────┐                           ▼                                │ N
    │    messages      │                  ┌────────────────┐                        ▼
    │ ─────────────── │                  │ relationship_  │             ┌──────────────────┐
    │ id (PK)         │                  │ events         │             │ recovery_        │
    │ session_id (FK) │                  │ ─────────────  │             │ checkins         │
    │ role            │                  │ id (PK)        │             │ ───────────────  │
    │ content         │                  │ entity_id (FK) │             │ id (PK)          │
    │ structured_json │ ←── _actionCard 在这里 │ event_type    │             │ plan_id (FK)     │
    │ intake_result   │                  │ event_time     │             │ user_id (FK)     │
    │ risk_level      │                  │ summary        │             │ day_index        │
    │ created_at      │                  └────────────────┘             │ mood_score       │
    └─────────────────┘                                                  │ reflection       │
                                                                          │ created_at       │
                                                                          └──────────────────┘

    ┌──────────────────┐
    │ analytics_events │
    │ ───────────────  │
    │ id (PK)          │  ← user_id 可空（匿名事件）
    │ user_id (FK?)    │     不与其它表强关联
    │ event_type       │
    │ payload          │
    │ created_at       │
    └──────────────────┘
```

**关键不变量**：
- 删除 `users` 行 → ON DELETE CASCADE 把所有相关数据带走
- 删除 `sessions` → 级联删 messages
- 用户关闭 memory → 后续不再写 user_profiles / relationship_* / memory_summaries
- 用户删除 memory → 删 memory_summaries / user_profiles，匿名化 relationship_entities (label → '匿名对象')
- `messages.structured_json._actionCard` 是富文本卡片快照，hydrate 时用

---

### 3.7 Orchestrator 决策状态机

从 IntakeResult 到最终 mode 的决策路径，包含智能融合层与 skipTextReplay 分支。

```
                            ┌─────────────────────┐
                            │  IntakeResult       │
                            │  + classifyByKeyword│
                            └──────────┬──────────┘
                                       │
                                       ▼
                            effective_risk = max(
                              intake.risk_level,
                              keyword_classifier
                            )
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │ effective_risk ?       │
                          └────┬──────┬──────┬─────┘
                               │      │      │
                  critical/high│ medium│  low │
                               │      │      │
                               ▼      ▼      ▼
                       ┌──────────┐ ┌──────────────────┐
                       │ mode =   │ │ 脆弱状态缓冲检查  │
                       │ 'safety' │ │ - emotion ∈      │
                       │          │ │   {desperate,    │
                       │ 跳过智能 │ │    numb}?        │
                       │ 融合层    │ │ - 上一轮 risk =   │
                       │ 跳过预运行│ │   medium?        │
                       │          │ └────┬─────────┬───┘
                       │          │      │ 命中    │ 否
                       │          │      ▼         ▼
                       │          │  ┌────────┐  ┌──────────────┐
                       │          │  │ mode = │  │ readIntent   │
                       │          │  │companion│  │ (intake)     │
                       │          │  └────────┘  └──────┬───────┘
                       │          │                     │
                       │          │           ┌─────────┼──────────────┬──────────────┬──────────┐
                       │          │           │         │              │              │          │
                       │          │           │ request │ message      │ create_plan  │ checkin  │
                       │          │           │_analysis│ _coach       │              │          │
                       │          │           ▼         ▼              ▼              ▼          ▼
                       │          │     ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────┐
                       │          │     │ mode =   │ │ mode =   │ │ planType?  │ │ active   │ │ 不动 │
                       │          │     │analysis  │ │ coach    │ │            │ │  plan?   │ │ mode │
                       │          │     │          │ │          │ │ 明确  模糊  │ │          │ │      │
                       │          │     │          │ │          │ │ │     │    │ │ 有  无    │ │      │
                       │          │     │          │ │          │ │ ▼     ▼    │ │ │   │    │ │      │
                       │          │     │          │ │          │ │createPlan  │ │ │   │    │ │      │
                       │          │     │          │ │          │ │push        │ │ │   │    │ │      │
                       │          │     │          │ │          │ │'plan_      │ │ │   │    │ │      │
                       │          │     │          │ │          │ │created'    │ │ │   │    │ │      │
                       │          │     │          │ │          │ │↓           │ │ │   │    │ │      │
                       │          │     │          │ │          │ │mode=       │ │ │   │    │ │      │
                       │          │     │          │ │          │ │recovery    │ │ │   │    │ │      │
                       │          │     │          │ │          │ │            │ │ │   │    │ │      │
                       │          │     │          │ │          │ │push 'plan_ │ │ │   │    │ │      │
                       │          │     │          │ │          │ │options' +  │ │ │   │    │ │      │
                       │          │     │          │ │          │ │intentForced│ │ │   │    │ │      │
                       │          │     │          │ │          │ │Text        │ │ │   │    │ │      │
                       │          │     │          │ │          │ │↓           │ │ │   │    │ │      │
                       │          │     │          │ │          │ │mode=       │ │ │   │    │ │      │
                       │          │     │          │ │          │ │companion   │ │ │   │    │ │      │
                       │          │     └────┬─────┘ └────┬─────┘ └────────────┘ │ │   │    │ │      │
                       │          │          │            │                       │ │   │    │ │      │
                       │          │          ▼            ▼                       │ │   │    │ │      │
                       │          │   ┌────────────┐┌────────────┐                 │ │   │    │ │      │
                       │          │   │预运行       ││预运行       │                 │ │   │    │ │      │
                       │          │   │tongAnalysis││messageCoach│                 │ │   │    │ │      │
                       │          │   │            ││            │                 │ │   │    │ │      │
                       │          │   │push        ││push        │                 │ │   │    │ │      │
                       │          │   │'analysis_  ││'coach_     │                 │ │   │    │ │      │
                       │          │   │result'     ││result'     │                 │ │   │    │ │      │
                       │          │   │            ││            │                 │ │   │    │ │      │
                       │          │   │skipText    ││skipText    │                 │ │   │    │ │      │
                       │          │   │Replay=true ││Replay=true │                 │ │   │    │ │      │
                       │          │   └────────────┘└────────────┘                 │ │   │    │ │      │
                       │          │                                                │ │   │    │ │      │
                       │          │                                              checkedIn?│    │ │      │
                       │          │                                                │ 否 │ 是  │ │      │
                       │          │                                                │ ▼  │ ▼   │ │      │
                       │          │                                                │ completeCheckin│      │
                       │          │                                                │ push 'checkin_  │      │
                       │          │                                                │ done' +intent  │      │
                       │          │                                                │ Forced (companion)    │
                       │          │                                                │  │   │    │ │      │
                       │          │                                                ▼  ▼   ▼    ▼ ▼      │
                       │          │                                       ┌──────────────────────────┐  │
                       │          │                                       │ mode = intake.next_mode  │  │
                       │          │                                       │ (companion / recovery)   │  │
                       │          │                                       └──────────────────────────┘  │
                       │          │                                                                      │
                       └──────────┴──────────────────────┬──────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────┐
                                              │ Step 6 模式路由       │
                                              │ Step 7-8 收集 buffer  │
                                              │ Step 9 Guard + retry │
                                              │ Step 10 sanitizeText │
                                              │ Step 11 写 messages  │
                                              │ Step 12 yield action │
                                              │   + delta (条件)     │
                                              │ Step 13 异步任务      │
                                              └──────────────────────┘
```

**关键决策点**：
- **risk 优先**：critical / high 一律 safety，跳过所有智能融合层判断
- **脆弱缓冲**：medium 风险或脆弱情绪一律 companion，避免触发"分析型"回复加重内耗
- **intent 改写**：智能融合层只在 risk < high 时生效，可以把默认 next_mode 改写到 analysis / coach / recovery，并 push 富文本卡片
- **skipTextReplay**：只有 analysis / coach 模式（且预运行成功 push 了卡片）会置 true，其它分支照常文字回放

---

## 四、Monorepo 目录结构

```
emotion-companion/
├── CLAUDE.md                              # 项目铁律 / 协作规范（最高优先级）
├── docs/
│   └── architecture.md                    # ⭐ 你正在看的这个
├── package.json                           # 根 workspace 配置
├── pnpm-workspace.yaml
├── tsconfig.base.json                     # 全栈共享 TS 配置
├── vercel.json                            # Vercel 部署配置（root variant）
│
├── apps/
│   ├── api/                               # Fastify 后端
│   │   ├── db/migrations/                 # SQL 迁移文件，按时间戳排序
│   │   ├── src/
│   │   │   ├── index.ts                   # 启动入口（实例化 AIClient + buildApp）
│   │   │   ├── app.ts                     # buildApp(): 注册插件、路由、依赖注入
│   │   │   ├── config/env.ts              # Zod 校验环境变量
│   │   │   ├── db/
│   │   │   │   ├── pool.ts                # pg.Pool 单例
│   │   │   │   ├── migrate.ts             # 迁移 runner
│   │   │   │   └── repositories/          # users / sessions / messages / memory / recovery
│   │   │   ├── middleware/
│   │   │   │   ├── jwt.ts                 # @fastify/jwt + requireAuth
│   │   │   │   └── error.ts               # 全局 error handler
│   │   │   ├── orchestrator/              # ⭐ 对话编排核心
│   │   │   │   ├── index.ts               # 8 步主流程
│   │   │   │   ├── router.ts              # 风险 + 脆弱缓冲 → mode 决策
│   │   │   │   ├── guard-runner.ts        # Guard + 重试 1 次
│   │   │   │   ├── replay.ts              # buffer 后切片回放
│   │   │   │   ├── placeholder.ts         # 占位 skill（未实现的 mode）
│   │   │   │   ├── analysis-input.ts      # 抽 facts 喂 tong-analysis
│   │   │   │   ├── coach-input.ts         # 抽 scenario 喂 message-coach
│   │   │   │   ├── recovery-input.ts      # 抽 plan_type 喂 recovery-plan
│   │   │   │   └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts                # /api/auth/login, /refresh
│   │   │   │   ├── sessions.ts            # /api/sessions CRUD + PATCH 改名
│   │   │   │   ├── chat-stream.ts         # /api/chat/stream SSE
│   │   │   │   ├── analysis.ts            # /api/analysis/relationship
│   │   │   │   ├── recovery.ts            # /api/recovery-plans + /checkin
│   │   │   │   ├── memory.ts              # /api/memory/timeline + /delete
│   │   │   │   ├── settings.ts            # /api/settings GET/PUT
│   │   │   │   └── health.ts              # /api/health 含 DB/Redis 检查
│   │   │   ├── services/
│   │   │   │   └── extractAnalysisInput.ts  # AI 抽取自然语言为结构化字段
│   │   │   ├── redis/client.ts            # ioredis 单例 + ready 等待
│   │   │   └── types/fastify.d.ts         # Fastify 类型扩展
│   │   ├── tests/
│   │   │   ├── helpers.ts                 # FakeAIClient + mock repos
│   │   │   ├── auth.test.ts
│   │   │   ├── sessions.test.ts
│   │   │   ├── chat-stream.test.ts
│   │   │   ├── orchestrator.test.ts
│   │   │   ├── recovery.test.ts
│   │   │   ├── memory.test.ts
│   │   │   └── jwt.test.ts
│   │   └── package.json
│   │
│   └── web/                               # React 前端
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx                    # Router + useAuth bootstrap
│       │   ├── pages/
│       │   │   ├── Chat/ChatPage.tsx      # ⭐ 对话主页
│       │   │   ├── Analysis/              # 关系分析（自然语言一段话）
│       │   │   ├── Recovery/              # 恢复计划（7天/14天）
│       │   │   ├── Growth/                # 成长 feed（events/entities/summaries）
│       │   │   └── Settings/              # 设置（tone + memory_enabled）
│       │   ├── components/chat/           # MessageBubble / MessageList / ChatInput
│       │   ├── stores/                    # Zustand: auth / session / chat / analysis / recovery / settings
│       │   ├── hooks/                     # useAuth / useChat / useSession / useAnalysis / useRecovery / useSettings
│       │   ├── api/                       # client / auth / sessions / stream / analysis / memory / recovery / settings
│       │   ├── utils/                     # anonymousId / time / markdown
│       │   └── index.css                  # Tailwind base
│       ├── tests/                         # Vitest + RTL
│       ├── vercel.json                    # Vercel 部署配置（apps/web variant）
│       └── package.json
│
├── packages/                              # 共享 + 业务能力
│   ├── shared/                            # 跨包共享类型 + Zod schema
│   │   └── src/
│   │       ├── types/                     # emotion / skill / api / recovery / memory
│   │       ├── schemas/                   # auth / session / chat / intake / analysis / recovery
│   │       └── constants/                 # GUARD_CHECKS / RISK_LEVEL_ORDER
│   │
│   ├── core-ai/                           # ⭐ AI 客户端抽象层 + Final Response Guard
│   │   └── src/
│   │       ├── types.ts                   # AIClient 接口 + AIMessage / Options
│   │       ├── factory.ts                 # createAIClient() — 根据 AI_PROVIDER 选型
│   │       ├── providers/
│   │       │   ├── anthropic.ts           # AnthropicClient（@anthropic-ai/sdk）
│   │       │   └── openai-compatible.ts   # OpenAICompatibleClient（openai v4，兼容 DeepSeek/通义千问/智谱等）
│   │       ├── client.ts                  # 旧 AnthropicClient（保留兼容）
│   │       ├── stream.ts                  # collectStream() 工具
│   │       ├── guard.ts                   # runFinalResponseGuard() 七项检查
│   │       └── errors.ts                  # AIError
│   │
│   ├── safety/                            # ⭐ 安全分类与兜底文案
│   │   └── src/
│   │       ├── classifier.ts              # 关键词级 risk_level
│   │       ├── triage.ts                  # runKeywordTriage / runFullTriage
│   │       ├── ai-classifier.ts           # Phase 7: AI 二次分类
│   │       ├── constants.ts               # CRISIS_HOTLINES / 文案模板
│   │       ├── rules.ts                   # allowedModes()
│   │       └── guard.ts                   # 旧 Phase 0 占位
│   │
│   ├── memory/                            # ⭐ 长短期记忆
│   │   └── src/
│   │       ├── short-term.ts              # getRecentMessages(pool, sessionId)
│   │       ├── long-term.ts               # getUserMemory + formatMemoryContext
│   │       ├── timeline.ts                # extractAndSaveEntities (AI 抽实体/事件)
│   │       └── summarizer.ts              # generateSessionSummary (AI 摘要)
│   │
│   ├── analytics/
│   │   └── src/tracker.ts                 # createTracker(pool) fire-and-forget 写埋点表
│   │
│   ├── prompts/                           # 共享 prompt builder（目前空骨架）
│   │
│   └── skills/                            # ⭐ 6 个 AI skill
│       ├── emotion-intake/                # 情绪/议题/风险分类（每轮必跑）
│       ├── companion-response/            # 共情陪伴回复（warm/rational/direct 三种语气）
│       ├── tong-analysis/                 # 关系分析（含 BlockedByRiskError）
│       ├── message-coach/                 # 三版本话术（含 BlockedByRiskError）
│       ├── recovery-plan/                 # 单日恢复任务
│       └── safety-triage/                 # safety 模式回复（关键词 + 可选 AI 二次分类）
│
├── infra/
│   ├── docker-compose.yml                 # 本地 Postgres + Redis（已不用，迁到云端了）
│   └── nginx/                             # 早期 nginx 配置参考
│
├── scripts/
│   └── vps/                               # ⭐ VPS 部署脚本
│       ├── README.md                      # 部署完整文档
│       ├── bootstrap.sh                   # 一键部署（curl | bash 入口）
│       ├── setup.sh                       # 底层初始化（装依赖/写 systemd/Nginx/certbot）
│       ├── deploy.sh                      # 增量更新（git pull + restart）
│       ├── config.example.sh              # 配置模板
│       ├── config.sh                      # 实际配置（gitignored）
│       └── templates/
│           ├── emotion-api.service.template  # systemd unit
│           ├── nginx-emotion-api.conf.template  # Nginx 反代
│           └── env.production.template    # apps/api/.env 模板
│
└── tests/                                 # （预留 e2e）
```

**包之间的依赖关系**：

```
                       apps/api
                          │
        ┌────┬───┬────────┼────────┬────────┐
        │    │   │        │        │        │
        ▼    ▼   ▼        ▼        ▼        ▼
   shared core-ai safety memory analytics  skills/*
        │    │     │        │        │        │
        │    └─────┴────────┴────────┴────────┤
        │                                     │
        └───────────► shared ◄────────────────┘
```

- `shared` 是最底层，所有包依赖它（共享类型 + Zod schema）
- `core-ai` / `safety` / `memory` / `analytics` 是横向能力包，互相不依赖
- `skills/*` 内部按需依赖 `core-ai` / `safety` / `shared`
- `apps/api` 在 orchestrator 里把它们组装起来
- `apps/web` 只依赖 `shared`（拿类型）

---

## 五、数据库 Schema

由 `apps/api/db/migrations/*.sql` 定义，按时间戳顺序应用，幂等（重复 apply 自动 skip）。

### 4 个迁移文件

| 时间戳 | 文件 | 创建的表 |
|---|---|---|
| `20260407000001` | `init_users_sessions_messages.sql` | `users`, `sessions`, `messages` |
| `20260407000002` | `memory_tables.sql` | `user_profiles`, `relationship_entities`, `relationship_events`, `memory_summaries` |
| `20260407000003` | `recovery_tables.sql` | `recovery_plans`, `recovery_checkins` |
| `20260407000004` | `analytics_events.sql` | `analytics_events` |

### users

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id    TEXT UNIQUE NOT NULL,            -- 前端 crypto.randomUUID() 生成,持久化到 localStorage
  email           TEXT,                            -- 预留 V2
  open_id         TEXT,                            -- 预留小程序
  nickname        TEXT,
  tone_preference TEXT NOT NULL DEFAULT 'warm'
                  CHECK (tone_preference IN ('warm','rational','direct')),
  memory_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### sessions

```sql
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '新对话',     -- 首条消息后 chat-stream 路由会自动改成首句截断
  mode          TEXT NOT NULL DEFAULT 'companion'
                CHECK (mode IN ('companion','analysis','coach','recovery','safety')),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### messages

```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  structured_json JSONB,                           -- 各 skill 的结构化输出（话术 / 分析等）
  intake_result   JSONB,                           -- emotion-intake 结果（去掉 reasoning 字段后）
  risk_level      TEXT CHECK (risk_level IN ('low','medium','high','critical')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**关键约束**：
- `intake_result` 写入前 orchestrator 会**剥离 `reasoning` 字段**（CLAUDE.md §13.2 要求）
- abort 情况下只写 user 消息，**不写 assistant 消息**（保持用户时间线真实）
- `structured_json` 的两类内容：
  1. **Skill 原始结构化输出**（`AnalysisResult` / `MessageCoachResult` / `RecoveryTask`）— 给后续审计与未来扩展用
  2. **`_actionCard: { action_type, payload }`** — 智能融合层富文本卡片快照，前端 `chatStore.hydrateFromDb` 会从这里重建 `ActionCard`，**保证刷新页面后历史卡片不丢失**
- `analysis` / `coach` 模式下 `content` 字段写占位符（`[关系分析结果见上方卡片]` / `[话术建议见上方卡片]`）而非完整正文，因为前端只渲染卡片，文字回放被跳过——避免一份内容渲染两次

### user_profiles（Phase 5）

```sql
CREATE TABLE user_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  traits_json          JSONB NOT NULL DEFAULT '{}',
  attachment_style     TEXT,                       -- 'secure' / 'anxious' / 'avoidant' / 'disorganized'
  boundary_preferences JSONB NOT NULL DEFAULT '{}',
  common_triggers      TEXT[] NOT NULL DEFAULT '{}',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### relationship_entities（Phase 5）

```sql
CREATE TABLE relationship_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  relation_type TEXT,                              -- 'ex' / 'partner' / 'ambiguous' / 'friend' / 'family' / 'other'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### relationship_events（Phase 5）

```sql
CREATE TABLE relationship_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id     UUID REFERENCES relationship_entities(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,                    -- 'breakup' / 'reconcile' / 'cold-war' / 'lost-contact' / 'confession' / 'first-meet' / 'other'
  event_time    TIMESTAMPTZ,                      -- 可空（很多事件时间未知）
  summary       TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### memory_summaries（Phase 5）

```sql
CREATE TABLE memory_summaries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('session','weekly','entity')),
  summary_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**记忆白名单（CLAUDE.md §14.1/14.2）**：
- **可写**：关系标签、明确事件时间、用户主动表达的边界偏好、恢复进度、依恋风格
- **禁止写**：原始脆弱表达、单次崩溃原话、家庭隐私、`risk_level >= high` 时的任何内容

**memory_enabled=false 时**：`packages/memory` 内的所有 upsert / create 函数立即 return null，不触达 DB。

**用户请求删除记忆**（CLAUDE.md §14.3）：
- `memory_summaries` / `relationship_events` / `relationship_entities`：**真删除** (`DELETE FROM`)
- `user_profiles`：保留行，**清空所有可识别字段**（PK 关联完整性需要）

### recovery_plans（Phase 6）

```sql
CREATE TABLE recovery_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type    TEXT NOT NULL CHECK (plan_type IN ('7day-breakup','14day-rumination')),
  total_days   INTEGER NOT NULL,                  -- 7 或 14
  current_day  INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','paused','abandoned')),
  payload_json JSONB NOT NULL DEFAULT '{}',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### recovery_checkins（Phase 6）

```sql
CREATE TABLE recovery_checkins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES recovery_plans(id) ON DELETE CASCADE,
  day_index  INTEGER NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT FALSE,
  reflection TEXT,
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, day_index)                    -- 关键: 同一天打卡只能存一条
);
```

**重要不变量**：
- `(plan_id, day_index)` 唯一约束 + repo 层 `FOR UPDATE` 行锁 + 已完成检测 → **保证每天只能打卡一次**
- 重复打卡：repo 返回 `already_done=true`，路由返回 **409 ALREADY_CHECKED_IN**

### analytics_events（Phase 7）

```sql
CREATE TABLE analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event_name  TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_analytics_events_user_created ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_analytics_events_name_created ON analytics_events(event_name, created_at DESC);
```

**埋点策略**：fire-and-forget 写入，**只记行为指标，不记原始脆弱表达**。

---

## 六、API 接口清单

所有响应统一格式（CLAUDE.md §12.2）：

```ts
// 成功
{ "success": true, "data": {...}, "timestamp": "ISO" }

// 失败
{ "success": false, "error": { "code": "...", "message": "...", "details": {} }, "timestamp": "ISO" }
```

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET  | `/api/health` | - | 含 DB / Redis / version / uptime 检查；degraded → 503 |
| POST | `/api/auth/login` | - | `{anonymous_id}` → `{token, user_id, expires_in}` |
| POST | `/api/auth/refresh` | Bearer（允许过期 30 天内）| 续 token |
| GET  | `/api/sessions` | Bearer | 当前用户的会话列表 |
| POST | `/api/sessions` | Bearer | 新建会话 `{title?, mode?}` |
| GET  | `/api/sessions/:id` | Bearer | 会话详情 + 历史消息 |
| PATCH | `/api/sessions/:id` | Bearer | 改标题 `{title}` |
| DELETE | `/api/sessions/:id` | Bearer | 删除会话（CASCADE 删消息）|
| POST | `/api/chat/stream` | Bearer | ⭐ 流式对话主入口（SSE）|
| POST | `/api/analysis/relationship` | Bearer | 关系分析（输入一段自然语言，AI 抽取后调用 tong-analysis）|
| GET  | `/api/recovery-plans` | Bearer | 列出当前用户的恢复计划 |
| POST | `/api/recovery-plans` | Bearer | 创建 7-day-breakup / 14-day-rumination |
| GET  | `/api/recovery-plans/:id` | Bearer | 计划详情 + 今日任务 + 历史打卡 |
| POST | `/api/recovery-plans/:id/checkin` | Bearer | 完成今日打卡（幂等，重复 → 409） |
| GET  | `/api/memory/timeline` | Bearer | 成长 feed（events + entities + summaries 三类）|
| POST | `/api/memory/delete` | Bearer | 真删除 + 匿名化用户全部长期记忆 |
| GET  | `/api/settings` | Bearer | `{tone_preference, memory_enabled}` |
| PUT  | `/api/settings` | Bearer | 局部更新 |

### 限流（Phase 7）

- 全局：60 req/min/user（默认）
- `/api/chat/stream`：单独配额（避免大量并发流压垮）
- `/api/analysis/relationship`：10 req/min/user（AI 调用昂贵）
- 限流 store：Redis（可用时） / 内存（fallback）

---

## 七、前端页面与路由

| 路径 | 组件 | 主要功能 |
|---|---|---|
| `/` | redirect → `/chat` | |
| `/chat` | `Chat/ChatPage.tsx` | 流式对话主页（左侧 sidebar 会话列表 + 右侧消息流 + 输入框）|
| `/analysis` | `Analysis/AnalysisPage.tsx` | 关系分析（**单 textarea 输入自然语言**，提交后展示分析卡片）|
| `/recovery` | `Recovery/RecoveryPage.tsx` | 恢复计划（创建计划 / 今日任务 / 心情滑块 / 反思打卡）|
| `/growth` | `Growth/GrowthPage.tsx` | 成长 feed（最近回顾 / 关系对象 chips / 关键事件时间线 / 清除记忆按钮）|
| `/settings` | `Settings/SettingsPage.tsx` | 语气偏好 + 长期记忆开关 |

每个页面 header 都有完整 nav：`对话 → 分析 → 恢复 → 成长 → 设置`，当前页高亮。

### 状态管理（Zustand stores）

| store | 职责 |
|---|---|
| `authStore` | `bootstrap()` 自动登录、`reauth()` 401 fallback、`logout()` |
| `sessionStore` | `fetchSessions` / `selectSession` / `newSession` / `removeSession` / `renameSession`（乐观更新 + 失败回滚）|
| `chatStore` | `messages` / `streaming` 状态 / `send()` / `abort()` / **`hydrateFromDb(sessionId, dtos)`**（跨页面切换不丢历史，从 `structured_json._actionCard` 重建富文本卡片，并按 `i === lastIndex` 给 `plan_options` 卡片打 `isLastMessage` 标记）|
| `analysisStore` | 单文本输入 → `analyze(text)` |
| `recoveryStore` | 计划列表 / 当前计划 / 今日任务 / 提交打卡 / 失败时也 fetchDetail |
| `settingsStore` | 拉取 + 局部更新 + 401 触发重登 |

### 关键组件

| 组件 | 路径 | 用途 |
|---|---|---|
| `MessageList` | `components/chat/MessageList.tsx` | 消息列表 + 自动滚到底 + 空状态占位 + `<ThinkingBubble>`（intake / 路由阶段的进度提示） |
| `MessageBubble` | `components/chat/MessageBubble.tsx` | 用户/助手两种气泡 + `<TypingDots>` 动画 + 流式 ▍光标 + `parseMiniMarkdown` 段落渲染 |
| `ChatInput` | `components/chat/ChatInput.tsx` | textarea + Enter 发送 / Shift+Enter 换行 / 流式中显示"停止"按钮 |
| `ActionCardRenderer` | `components/cards/ActionCardRenderer.tsx` | 智能融合层卡片分发器：按 `action_type` 路由到 `AnalysisResultCard` / `CoachResultCard` / `PlanCreatedCard` / `PlanOptionsCard` / `CheckinDoneCard` |
| `PlanOptionsCard` | `components/cards/PlanOptionsCard.tsx` | 计划二选一按钮；接受 `isLastMessage` prop，false 时降级为「已选择计划」静态状态，避免历史消息上的按钮被重复点击 |

### 客户端持久化

| key | 内容 | 在哪 |
|---|---|---|
| `emotion.anonymous_id` | UUID v4 | localStorage |
| `emotion.token` | JWT | localStorage |

刷新页面后自动用 anonymous_id 重新走 `POST /api/auth/login`。

---

## 八、对话编排（Orchestrator）核心流程

`apps/api/src/orchestrator/index.ts` 是整个项目的心脏。它实现 CLAUDE.md §8 的 8 步流程：

```
用户消息 (POST /api/chat/stream)
    │
    ▼
Step 1: 拉短期历史 (recentBySession, 最多 6 条)
    │
    ▼
Step 2: 跑 emotion-intake skill (非流式 JSON)
    │  得到 IntakeResult: emotion_state / issue_type / risk_level / next_mode / confidence / reasoning
    │
    ▼
Step 3: 风险检查（最高优先级）
    ├─ effective_risk = max(intake.risk_level, classifyByKeywords(user_text))
    ├─ effective_risk === 'critical' → mode='safety'
    ├─ effective_risk === 'high'     → mode='safety' (analysis/coach 被禁)
    └─ < high                        → 继续 Step 4
    │
    ▼
Step 4: 脆弱状态缓冲
    ├─ emotion_state ∈ {desperate, numb} → mode='companion'
    ├─ 最近 1 条 assistant 消息 risk_level === 'medium' → mode='companion'
    └─ 否则按 intake.next_mode
    │
    ▼
Step 5: 智能融合层 (intent-aware routing, risk < high 才进)
    │  根据 intake.intent 识别用户的"真实意图"，可能改写 decision.mode 或
    │  直接生成富文本卡片（不走 skill）：
    ├─ request_analysis → mode='analysis'
    ├─ message_coach   → mode='coach'
    ├─ create_plan(明确)  → 直接 createPlan + push 'plan_created' action
    ├─ create_plan(模糊)  → push 'plan_options' action + 引导文案 (intentForcedText)
    ├─ checkin            → completeCheckin + push 'checkin_done' action + 致意文案
    └─ view_timeline / chat → 不动 decision
    │  这些 action 事件先存在 pendingActions[]，meta 之后顺序 yield 给前端
    │
    ▼
Step 6: 模式路由
    ├─ companion → companion-response skill (流式)
    ├─ analysis  → analysis-input.ts 抽 facts → tong-analysis 预运行 (非流式)
    │             → push 'analysis_result' action + 设置 skipTextReplay=true
    ├─ coach     → coach-input.ts 抽 scenario → message-coach 预运行 (非流式)
    │             → push 'coach_result' action + 设置 skipTextReplay=true
    ├─ recovery  → recovery-input.ts → recovery-plan skill
    └─ safety    → safety-triage skill (规则,不调 AI)
    │
    ▼
Step 7: 注入长期记忆 (memory_enabled && risk < high)
    │  调 getUserMemory + formatMemoryContext → 拼到 system prompt
    │  额外把 active plan / 是否已打卡作为 extras 拼进 memory_context
    │
    ▼
Step 8: 收集 skill 输出到 buffer (collectStream)
    │  注意: companion 是流式,但服务端先 buffer 完整内容
    │  analysis / coach 由预运行已得到 firstText，直接复用
    │
    ▼
Step 9: Final Response Guard + 重试一次
    ├─ 第一次失败 → 重新调一次 skill → 用第二次结果
    └─ 第二次仍失败 → warn 日志 + 输出第二次内容（不回退到第一次）
    │
    ▼
Step 10: sanitizeText 文本清洗 (replay.ts:sanitizeText)
    │  只过滤 U+FFFD 替换符 + 不可见 ASCII 控制字符 + 压缩 \n{3,} → \n\n
    │  不动 emoji（按范围过滤会误伤相邻汉字，参见 replay.ts 注释）
    │
    ▼
Step 11: 写 messages 表
    ├─ user 消息 (always; abort 时也写)
    ├─ assistant 消息 (仅未 abort 时):
    │   ├─ skipTextReplay 时 content = '[关系分析结果见上方卡片]' / '[话术建议见上方卡片]'
    │   ├─ 其它情况 content = sanitizeText(finalText)
    │   └─ structured_json 合并 baseStructured + _actionCard
    └─ intake_result 写入时剥离 reasoning 字段
    │
    ▼
Step 12: 回放给客户端
    ├─ pendingActions 顺序 yield 为 'action' 事件 (meta 之后立即推)
    ├─ skipTextReplay=false: 把 finalText 切成 2-6 字符片段 yield 'delta' 事件
    │  (replayChunks, 固定切片，按 Unicode 码点切防止 surrogate pair 截断)
    └─ skipTextReplay=true (analysis / coach): 跳过 delta 回放，前端只渲染卡片
    │
    ▼
Step 13: fire-and-forget 异步任务
    ├─ generateSessionSummary (memory_enabled && risk < high)
    └─ extractAndSaveEntities (同上)
    │
    ▼
SSE 输出: data: {"type":"thinking",...} → data: {"type":"meta",...} → data: {"type":"action",...} × M → data: {"type":"delta",...} × N → data: {"type":"done","metadata":{...}}
```

### 智能融合层与 ActionCard 持久化

`pendingActions[]` 是 orchestrator 在 Step 5/6 收集的「富文本卡片事件」缓冲，最多 5 种类型：

| `action_type` | 来源 | 前端卡片 |
|---|---|---|
| `analysis_result` | tong-analysis 预运行成功 | `AnalysisResultCard` |
| `coach_result`    | message-coach 预运行成功 | `CoachResultCard`    |
| `plan_created`    | intent=create_plan + 明确类型 → createPlan 成功 | `PlanCreatedCard`    |
| `plan_options`    | intent=create_plan + 模糊 → 二选一引导 | `PlanOptionsCard`    |
| `checkin_done`    | intent=checkin + 当日未打卡 → completeCheckin | `CheckinDoneCard`    |

写 messages 表时，`pendingActions[0]` 会被打包成 `_actionCard: { action_type, payload }` 合并进 `structured_json`，前端 `chatStore.hydrateFromDb` 在加载历史会话时从这里重建 `ChatViewMessage.actionCard`，**保证刷新页面后历史卡片不丢失**。

`PlanOptionsCard` 特殊处理：hydrate 时按 `i === lastIndex` 标记 `isLastMessage`，false 时渲染「已选择计划」静态状态，避免用户在历史消息上重复点击。

### 为什么 buffer-then-replay 而不是真正流式

设计权衡（决策点 #1，CLAUDE.md §13）：
- **Pro**：guard 在用户看到任何文字之前完成，retry 也不会让用户看到两次回复
- **Con**：first-token 延迟 +2-5 秒
- **决策**：安全优先，Phase 7 接受这个延迟

未来可改为"流式 + 末尾 guard 的纠正补丁"模式，但需要 UX 设计配套。

### 中止 (abort) 行为

- 客户端断开 → `request.raw.on('close')` 触发 → 调用 `ac.abort()`
- AbortController 信号传给所有 AI 调用与 collectStream
- **写 user 消息**（保留时间线真实性）
- **不写 assistant 消息**
- 不更新 sessions.message_count

---

## 九、Skills 系统

CLAUDE.md §9 规定的 6 个 skill。每个都是独立 npm 包，统一接口：

```ts
type SkillInput = {...}
type SkillOutput = {...}
type SkillDeps = { ai: AIClient, signal?, timeoutMs?, ... }

async function runXxx(input, deps): Promise<SkillOutput>
// 或者流式:
function runXxx(input, deps): AsyncIterable<string>
```

### Skill 调用矩阵（CLAUDE.md §9.2）

| Skill | 允许调用条件 | 禁止条件 | 备注 |
|---|---|---|---|
| `emotion-intake` | 所有场景，每次对话**必须先调** | 无 | 解析失败返回 SAFE_DEFAULT_INTAKE |
| `companion-response` | `next_mode='companion'` 或脆弱缓冲 | `risk='critical'` | 流式，3 种 tone（warm/rational/direct）|
| `tong-analysis` | `next_mode='analysis'` 且 `risk<'high'` | `risk>='high'` | **抛 BlockedByRiskError** 作第二道防线 |
| `message-coach` | `next_mode='coach'` 且 `risk<'high'` | `risk>='high'` | 同上 |
| `recovery-plan` | `next_mode='recovery'` | `risk='critical'` | 同上但只阻 critical |
| `safety-triage` | `risk>='high'` | 无（最高优先级） | 关键词版 +（Phase 7）AI 二次分类 |

### 共同模式

- 每个 skill 都有 `parser.ts` + `SAFE_DEFAULT_*`：解析失败永远走兜底，不抛错
- 所有 prompt 都要求严格 JSON 输出
- 严禁直接暴露给前端，必须由 orchestrator 调度（通过 `BlockedByRiskError` 第二道防线强制约束）
- **emoji 硬约束**：`companion-response` 与 `message-coach` 的 system prompt 都明确禁止任何 emoji 输出（含功能性符号 ✓ ✅）。理由：SSE 流式分片 + 前端 JSON 解析在某些边缘 case 会让多字节字符变成 ◆，从源头禁产生 emoji 比在传输/渲染层补救稳得多。前端字体本身（Noto Sans SC）能渲染 emoji，所以这只是输出策略，不是字体限制。

### Schema 严格性（`packages/shared/src/schemas/analysis.ts`）

`AnalysisResultSchema.tone` 是严格白名单 `z.enum(['gentle', 'neutral', 'direct'])`，**不挂 `.catch()` 兜底**。任何非法 tone 一律让 `safeParse` 失败，由 parser 层统一降级到 `SAFE_DEFAULT_ANALYSIS`——schema 作为契约边界保持严格，AI 输出的容错统一在 parser 层做一次，不要散落到多处。

### tong-analysis 的特殊说明

`tong-analysis` 的 SYSTEM_PROMPT 思维框架**蒸馏自外部开源 skill**：

- **来源**：[hotcoffeeshake/tong-jincheng-skill](https://github.com/hotcoffeeshake/tong-jincheng-skill)（MIT License）
- **采纳内容**：5 个心智模型 + 9 条决策启发式
- **故意不采纳**：第一人称角色扮演、宣判式金句（会被 `no_verdict_as_analysis` guard 拦截）、口语化称谓
- **完整设计文档**：见 [`packages/skills/tong-analysis/PROMPT_DESIGN.md`](../packages/skills/tong-analysis/PROMPT_DESIGN.md)

一句话：**我们抄了他的思维内核，没抄他的语气**。这样既能用上验证过的关系洞察框架，又不破坏我们的 Final Response Guard 七项检查。

**Parser 健壮性设计**（`packages/skills/tong-analysis/src/parser.ts`）：

| 解析层 | 触发条件 | 兜底结果 |
|---|---|---|
| 1. `JSON.parse(jsonStr)` | 模型按 spec 输出干净 JSON | 通过 `AnalysisResultSchema` 校验后返回完整 `AnalysisResult` |
| 2. `repairUnescapedQuotes` | 模型在 JSON 字符串值内部写了未转义的英文 `"` | 修复后再次 parse，成功则同上 |
| 3. `extractAnalysisFromTruncated` | 模型 `finish_reason=length` 截断在 analysis 字段中段，连收口大括号都没有 | 状态机抠出已写的 analysis 文本，包成 `confidence: 0.3` 的"降级但有信息"结果，区别于 `SAFE_DEFAULT_ANALYSIS` 的 `confidence: 0`「完全没拿到」 |
| 4. `SAFE_DEFAULT_ANALYSIS` | 上述都失败 / schema 校验不通过 | 一段克制的「无法基于现有信息分析」文案 |

`runTongAnalysis` 默认 `max_tokens: 4096`（之前是 2048，中文场景下 6 字段输出经常被 finish_reason=length 截断），orchestrator 想自定义仍可通过 `deps.maxTokens` 覆盖。

### 各 skill 的输入输出（简化版）

```ts
// emotion-intake
input:  { user_text, recent_history? }
output: { emotion_state, issue_type, risk_level, next_mode, confidence, reasoning }

// companion-response (流式)
input:  { user_text, emotion_state, intake?, recent_history?, tone_preference?, memory_context? }
output: AsyncIterable<string>

// tong-analysis
input:  { user_goal, relationship_stage, facts[], user_state, required_output[], memory_context? }
output: { analysis, evidence[], risks[], advice, confidence, tone }

// message-coach
input:  { scenario, user_goal, relationship_stage?, draft?, memory_context? }
output: { options: [{version: 'A'|'B'|'C', content, tone, usage_tip}, ...] }

// recovery-plan
input:  { plan_type: '7day-breakup'|'14day-rumination', day_index, user_state? }
output: { day_index, task, reflection_prompt, encouragement }

// safety-triage
input:  { user_text }
output: { meta: SafetyResponse, stream: AsyncIterable<string> }
```

---

## 十、Safety 与 Guard

### 风险等级

| 等级 | 触发场景示例 | 系统动作 |
|---|---|---|
| `low` | 普通倾诉、轻度纠结 | 正常陪伴或分析 |
| `medium` | 反复内耗、深夜情绪脆弱 | 减少刺激性表达 |
| `high` | 强烈自我否定、提及伤害意图 | **切 safety**，禁止 analysis/coach |
| `critical` | 明确危险表达、极度崩溃 | **强制 safety**，提供现实求助 |

### Risk 计算来源

1. **emotion-intake skill** 输出的 `risk_level`（AI 判断）
2. **packages/safety/classifier.ts** 的关键词匹配（同步、保守、宁可漏判不误判）
3. **取较高者** 作为 `effective_risk`

### Final Response Guard（CLAUDE.md §13.2）

`packages/core-ai/src/guard.ts` 在跑 7 项检查前先调一次内部 `sanitizeForGuard`：清掉 `U+FFFD` 替换符与不可见 ASCII 控制字符（emoji 一律放行），避免乱码符号穿插切断关键词正则匹配（例如 emoji 插在「建议」中间导致 `has_actionable_suggestion` 误判）。Guard 只读不写，真正的 wire-level 清洗由 orchestrator 在 Step 10 用 `replay.ts:sanitizeText` 统一做一次。

7 项检查清单：

| 检查 | 实现策略 | 备注 |
|---|---|---|
| `no_absolute_promise` | 正则匹配 "永远不会"/"绝对不"/"只有你才"… | |
| `no_dependency_suggestion` | "只有我能"/"离不开我"/"找别人没用"… | |
| `no_verdict_as_analysis` | "他就是不爱你"/"对方根本不在乎"… | **仅 analysis 模式严格** |
| `has_actionable_suggestion` | 必须包含动作词 "可以试试"/"建议你"/"今晚"… | **safety 模式豁免** |
| `no_excessive_bonding` | "只有我懂你"/"我永远陪着你"… | |
| `critical_has_real_help` | 必须含 "热线"/"心理援助"/"信任的人"… | **仅 critical 时检查** |
| `no_dangerous_content` | 黑名单："割腕"/"上吊"/"具体方法"… | |

### 重试策略

```
skill 第一次调用 → buffer → guard
    │
    ├─ pass → 直接回放
    │
    └─ fail → 重新调用 skill
              │
              ├─ pass → 用第二次结果回放
              │
              └─ fail → warn 日志 + 输出第二次内容
                       (不回退到第一次,因为第一次更可疑)
```

### Critical 文案常量

`packages/safety/src/constants.ts`：

```ts
export const CRISIS_HOTLINES = [
  '北京心理危机研究与干预中心 010-82951332',
  '全国心理援助热线 400-161-9995',
];
export const REAL_HELP_GUIDANCE = '请联系你所在地区的紧急援助或心理支持热线（例如：...）。';
export const CRISIS_RESPONSE_TEMPLATE = '这条消息让我很担心你。... ' + REAL_HELP_GUIDANCE + '...';
```

可以通过环境变量 `CRISIS_HOTLINES_OVERRIDE` 覆盖（用 `;` 分隔），便于法务/产品调整。

---

## 十一、Memory 系统

### 三层结构

| 层 | 来源 | 写入时机 | 读取时机 |
|---|---|---|---|
| **短期** | `messages` 表最近 N 条 | 每条对话写入时 | orchestrator Step 1 注入 prompt |
| **长期 - 摘要** | `memory_summaries` 表 | 每条 assistant 回复后 fire-and-forget | orchestrator Step 6 注入 system prompt |
| **长期 - 实体/事件** | `relationship_entities` / `relationship_events` | 同上 | 同上 + 成长页展示 |
| **长期 - 用户画像** | `user_profiles` | 暂未实现自动写入（Phase 5 留口）| 同上 |

### 异步生成策略

orchestrator Step 11 在主流程结束后**fire-and-forget**调用：

```ts
if (memoryEnabled && effective_risk !== 'high' && effective_risk !== 'critical') {
  void mem.generateSessionSummary(sessionId, userId, true).catch(log.warn);
  void mem.extractAndSaveEntities(sessionId, userId, true).catch(log.warn);
}
```

- **不 await**：不影响主响应延迟
- **memory_enabled 守门**：用户关闭记忆时立即返回 null
- **风险守门**：high/critical 会话不写长期记忆（保护脆弱内容）
- **失败静默**：只 warn 日志，不影响主流程

### 摘要规则（CLAUDE.md §14.4）

由 `generateSessionSummary` 实现，prompt 强制：
- **必须包含**：核心议题、关键事实、状态变化、建议接受情况
- **绝对禁止**：复述用户原话、复述脆弱细节、超过 200 字、少于 80 字
- **频率**：检测最新消息时间 > 上次摘要时间才生成（避免重复）

### 删除流程（CLAUDE.md §14.3）

`POST /api/memory/delete` 在事务中：

```sql
DELETE FROM memory_summaries WHERE user_id = $1;
DELETE FROM relationship_events WHERE user_id = $1;
DELETE FROM relationship_entities WHERE user_id = $1;
UPDATE user_profiles
   SET traits_json='{}'::jsonb, attachment_style=NULL,
       boundary_preferences='{}'::jsonb, common_triggers='{}'
 WHERE user_id = $1;
```

`user_profiles` 保留行（PK 完整性），其他三张表真删除。删除后 timeline 接口立即返回空，不残留 `[已删除]` 字样。

---

## 十二、Recovery Plan

### 两种计划

| plan_type | 总天数 | 主题 |
|---|---|---|
| `7day-breakup` | 7 | 7 天走出失恋（放下、接受、自我关爱）|
| `14day-rumination` | 14 | 14 天停止内耗（识别触发、建立边界、重建自我）|

### 打卡幂等性（关键不变量）

```
完成今日打卡 (POST /api/recovery-plans/:id/checkin)
    │
    ▼
repo.completeCheckin (事务 + FOR UPDATE 行锁)
    ├─ 1. SELECT plan FOR UPDATE
    ├─ 2. SELECT existing checkin (plan_id, day_index)
    ├─ 3a. existing.completed === true:
    │     → 返回 { already_done: true, plan, checkin } 不推进 current_day
    ├─ 3b. 否则:
    │     → upsert checkin completed=true
    │     → UPDATE plan SET current_day = current_day + 1
    │     → 若 current_day > total_days: status='completed'
    │     → 返回 { already_done: false, plan, checkin }
    ▼
路由层
    ├─ already_done === true → 返回 409 ALREADY_CHECKED_IN
    └─ 否则 → 200 ok({checkin, plan})
```

### 前端判断"今日已完成"的三层兜底

`apps/web/src/pages/Recovery/RecoveryPage.tsx` 的 `todayCheckin` useMemo：

```ts
// 1) 本会话刚提交过 (最快锁住按钮,防 React rerender 延迟引起重复点击)
if (justSubmittedCheckin) return justSubmittedCheckin;

// 2) 主路径: 服务端打卡成功后 current_day 已推进一格
//    所以"刚完成的那一天" = current_day - 1
const justFinishedDayIndex = currentPlan.current_day - 1;
if (justFinishedDayIndex >= 1) {
  const fromAdvance = checkins.find(c => c.day_index === justFinishedDayIndex && c.completed);
  if (fromAdvance) return fromAdvance;
}

// 3) 兜底: 服务端因故未推进时按 current_day 本身查
return checkins.find(c => c.day_index === currentPlan.current_day && c.completed) ?? null;
```

### 今日任务生成

`/api/recovery-plans/:id` 详情接口在 active plan 上**实时生成今日任务**：
- 调用 `runRecoveryPlan({plan_type, day_index: current_day})`
- **强制 5 秒超时**（避免 AI 卡死整个详情接口）
- 失败 → `makeSafeDefaultTask(day_index)` 兜底文案

---

## 十三、Auth 流程

### 匿名登录闭环（CLAUDE.md §11）

```
首次访问
    │
    ▼
前端 useAuth Hook 触发 bootstrap
    │
    ▼
检查 localStorage['emotion.anonymous_id']
    ├─ 不存在 → crypto.randomUUID() 生成 → 持久化到 localStorage
    └─ 存在 → 直接用
    │
    ▼
POST /api/auth/login {anonymous_id}
    │
    ▼
后端 users.findByAnonymousId(id)
    ├─ 存在 → 直接签 JWT
    └─ 不存在 → INSERT users → 签 JWT
    │
    ▼
返回 {token, user_id, expires_in}
    │
    ▼
前端 localStorage['emotion.token'] = token
authStore.status = 'authed'
```

### Token 过期 & 刷新

```
后续请求 401
    │
    ▼
fetchJson 拦截 → 触发 onUnauthorized 回调 (authStore.reauth)
    │
    ▼
POST /api/auth/refresh (Bearer 旧 token)
    │
    ├─ 成功 → 更新 token → 重试原请求
    │
    └─ 失败（token 过期超过 30 天 / 用户已删）
       │
       ▼
       fallback: 用 anonymous_id 重新走 /api/auth/login
       │
       ├─ 成功 → 更新 token → 重试原请求
       └─ 失败 → authStore.status='error'
```

### 越权防御

- 所有 `/sessions/:id` 路由必须先 `getPlanById(id, userId)` 校验归属
- 所有 `/recovery-plans/:id` 同上
- 所有 `repos.*.delete(id, userId)` 在 SQL `WHERE user_id = $1 AND id = $2`
- 越权返回 **404**（不是 403），不暴露资源是否存在

### JWT 配置

```env
JWT_SECRET=<48 字节 base64url 强随机串,setup.sh 自动生成>
JWT_EXPIRES_IN=7d
JWT_REFRESH_GRACE_SECONDS=2592000   # 允许过期 30 天内 refresh
```

---

## 十四、Streaming（SSE）流程

### 协议规范（CLAUDE.md §12.3）

- HTTP 方法：**POST**（不是 GET，因为要带 Bearer 鉴权）
- Content-Type: `text/event-stream`
- 客户端必须用 `@microsoft/fetch-event-source`，**禁止用原生 EventSource**（不支持 POST + 自定义 header）
- chunk 格式：`data: {"type":"delta","content":"..."}\n\n`
- 结束信号：`data: {"type":"done","metadata":{...}}\n\n`
- 错误信号：`data: {"type":"error","code":"...","message":"..."}\n\n`
- meta 信号：`data: {"type":"meta","mode":"...","risk_level":"..."}\n\n`

### 服务端实现要点（chat-stream.ts）

```ts
// 1. Bearer + body 校验 + 会话归属校验
// 2. 自动起标题(首条消息时,session.title='新对话' && message_count=0)
// 3. reply.hijack() 接管底层响应
// 4. 显式写 SSE + CORS headers (因为 hijack 后 @fastify/cors 的 onSend hook 不再触发)
//    - Content-Type: text/event-stream; charset=utf-8
//    - Cache-Control: no-cache, no-transform
//    - Connection: keep-alive
//    - X-Accel-Buffering: no  (Nginx 不缓冲)
//    - Access-Control-Allow-Origin: <pickAllowedOrigin>
//    - Access-Control-Allow-Credentials: true
//    - Vary: Origin
// 5. AbortController + request.raw.on('close') 处理客户端断开
// 6. setInterval(15s) 写 ": ping\n\n" keepalive (兼容 Cloudflare 100s 超时)
// 7. orchestrate(...) 异步生成器,逐个事件写入 raw
// 8. 异常路径写 error chunk + raw.end()
```

### Nginx 关键配置

`scripts/vps/templates/nginx-emotion-api.conf.template`：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE / 长连接关键设置
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    chunked_transfer_encoding on;
}
```

### Cloudflare 兼容

- **必须 DNS-only 灰云** 部署 + certbot 申请期间
- 部完后想开代理：SSL/TLS 改 **Full (strict)** + Cache Level **Bypass** + Rocket Loader 关
- 我们 keepalive 15s < CF 免费版 100s 超时 → SSE 长连接不会被切断

---

## 十五、Analytics 埋点

`packages/analytics/src/tracker.ts` 提供 `createTracker(pool)`，写入 `analytics_events` 表。

### 埋点策略

- **fire-and-forget**：不 await，失败只 warn 日志
- **只记行为指标**：event_name + user_id + properties
- **不记原始内容**：禁止把 user_text / assistant_reply 写入 properties

### 当前埋点事件

| event_name | 触发位置 | properties |
|---|---|---|
| `chat_message_sent` | chat-stream 路由开始 | session_id, content_length, request_id |
| `analysis_requested` | analysis 路由开始 | risk_level, text_length |
| `recovery_plan_created` | recovery 创建路由 | plan_type |
| `recovery_checkin_completed` | recovery checkin 路由成功 | plan_id, day_index, mood_score |
| `safety_triggered` | orchestrator 进 safety 分支 | risk_level, source（intake/keyword/ai-classifier）|
| `memory_deleted` | memory delete 路由 | summariesDeleted, entitiesDeleted, eventsDeleted |

### 测试 / 未配置数据库时

`createNoopTracker()` 返回什么也不做的实例，方便 mock。

---

## 十六、Phase 历史

按时间顺序：

| Phase | 状态 | 内容 |
|---|---|---|
| **0** | ✅ | monorepo 骨架、React+Vite 前端、Fastify 后端、6 个 skill 占位、shared 类型 |
| **1** | ✅ | 匿名登录、JWT、会话 CRUD、SSE mock 流（不调 AI）|
| **2** | ✅ | emotion-intake skill 真实化、orchestrator 8 步、companion-response、safety-triage 关键词版、Final Response Guard 七项 |
| **3** | ✅ | tong-analysis wrapper（AI 抽 facts → 调 Anthropic Messages API）、`/api/analysis/relationship` 路由、`BlockedByRiskError` 第二道防线 |
| **4** | ✅ | message-coach（A/B/C 三版本话术）、companion-response 三种 tone（warm/rational/direct）、quick topics |
| **5** | ✅ | 短期 / 长期记忆、relationship_entities / events、memory_summaries、`/api/memory/timeline` + `/delete` 接口、成长页 |
| **6** | ✅ | 7-day-breakup / 14-day-rumination 计划、recovery-plan skill、单日任务、心情打卡、幂等保护 |
| **7** | ✅ | safety AI 二次分类、guard 强化、健康检查接口（DB+Redis+version+uptime）、限流（Redis store+内存 fallback）、analytics 埋点、生产环境校验、settings 接口、auto-title、VPS 一键部署脚本 |
| **7+** | ✅ | 智能融合层 `pendingActions` + 5 种 ActionCard 持久化（`structured_json._actionCard`）；analysis/coach 跳过文字回放（`skipTextReplay`）改为只渲染卡片 + DB 占位符；tong-analysis parser 截断抢救（`extractAnalysisFromTruncated` + `confidence: 0.3`）+ max_tokens 4096；`sanitizeText` 输出清洗（U+FFFD + 控制字符，**不动 emoji**）；prompt 层硬性禁 emoji；`AnalysisResultSchema.tone` 恢复严格 enum；前端字号体系全站统一 + ChatPage 顶栏导航修复 |

每个 Phase 的关键决策见 `docs/phases/phaseN.md`（如有）。

---

## 十七、运维操作手册

> 完整版请看 **[`docs/runbook.md`](./runbook.md)** —— 那里有日志查看的所有姿势、故障 playbook、应急回滚、常用 alias 配置等。
>
> 这里只放最常用的几条。

### 日常更新（代码改动后）

```powershell
# 1. 本地推到 GitHub
cd E:\ai\project\emotion\source
git add . && git commit -m "..." && git push origin main
```

```bash
# 2. VPS 上拉新代码 + 重启
sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh
```

deploy.sh 会做：`git pull` → `pnpm install --frozen-lockfile` → `typecheck` → `db:migrate` → `systemctl restart emotion-api` → curl `/api/health` 自检。

### 日志 / 状态 / 重启

```bash
# 实时日志
sudo journalctl -u emotion-api -f

# 最近 100 行
sudo journalctl -u emotion-api -n 100 --no-pager

# 服务状态
sudo systemctl status emotion-api

# 重启
sudo systemctl restart emotion-api

# 停止
sudo systemctl stop emotion-api
```

### 改环境变量

```bash
sudo nano /home/emotion/emotion/apps/api/.env
sudo systemctl restart emotion-api
```

### 改 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/emotion-api
sudo nginx -t                           # 语法检查
sudo systemctl reload nginx             # 平滑重载
```

### 改 systemd unit

```bash
sudo nano /etc/systemd/system/emotion-api.service
sudo systemctl daemon-reload            # 必须先 reload
sudo systemctl restart emotion-api
```

### 强制续期 HTTPS 证书

```bash
sudo certbot renew --force-renewal
```

certbot 已设置 cron 自动续期，正常情况不用手动跑。

### 看 SSL 证书过期时间

```bash
sudo certbot certificates
```

### 数据库连接（应急排查）

```bash
sudo -u emotion psql "$(grep ^DATABASE_URL= /home/emotion/emotion/apps/api/.env | cut -d= -f2-)"
```

### 健康检查

```bash
# 内网
curl http://127.0.0.1:3000/api/health

# 外网
curl -i https://api.botjive.net/api/health
```

返回 `{"data":{"status":"ok",...}}` 即正常。`degraded` 时返回 503，便于负载均衡识别。

### 完全重新部署

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/muxang/emotion-companion/main/scripts/vps/bootstrap.sh)
```

bootstrap.sh 是幂等的，会自动跳过已完成的步骤。

---

## 十八、已知限制与未来工作

### 已知限制

| 领域 | 限制 | 影响 |
|---|---|---|
| Streaming | buffer-then-replay 模式，first-token 慢 2-5 秒 | 用户感知"AI 思考时间略长"；TypingDots 动画+状态条缓解 |
| Safety | 关键词 + 简单 AI 分类，对反语 / 隐喻 / 复合表达可能漏判 | 完整 AI 分类版可在 Phase 7+ 加强 |
| Memory | `extractAndSaveEntities` 抽实体不去重 | 多次提到同一人会创建多条 entity（已由 extractAndSaveEntities 内部 lower(label) 去重） |
| Recovery | 同一会话/同一刷新内只能打一天卡 | 符合"每天一次"语义，但用户想连打多天需要刷新页面 |
| Auth | JWT 没有黑名单 | 用户登出后旧 token 在剩余有效期内仍然可用；考虑 Phase 7+ 加 Redis revocation list |
| Analytics | 单表 BIGSERIAL，没有 partition | 长期增长后查询会变慢；可在 Phase 8 加月度 partition |
| 限流 | 全局 60 req/min 简单粗暴 | 没有按 endpoint 精细化（除 chat-stream / analysis 已单独配） |
| Build | 不编译 dist，生产用 tsx 直接跑 .ts | 启动慢约 200-500ms；tsx 进 prod deps |
| 多实例 | 当前是单 VPS 单 Node 进程 | 要多实例需要把 SSE / rate-limit 状态迁到 Redis（已部分支持）+ 加 LB |

### 测试覆盖

总共 **约 150+ 用例 / 29 测试文件**，分布：

| 包 | 文件数 | 用例数 |
|---|---|---|
| apps/api | 7 | 50+ |
| apps/web | 9 | 38 |
| packages/safety | 2 | 37 |
| packages/core-ai | 4 | 42（含 factory 11 + openai-compatible 8）|
| packages/skills/emotion-intake | 1 | 15 |
| packages/skills/tong-analysis | 1 | 13 |
| packages/skills/message-coach | 1 | ~12 |
| packages/skills/recovery-plan | 1 | ~10 |
| packages/skills/companion-response | 1 | ~14 |
| packages/skills/safety-triage | 1 | 3 |
| packages/{shared, memory, analytics, prompts} | 4 | 4（占位）|

### Phase 7 后建议

**必做**：
- [ ] 上线前真实跑一轮 AI smoke test（FakeAIClient 不能验证真实 API 行为）
- [ ] 给 Supabase 配 IP 白名单（只允许 VPS 出口 IP）
- [ ] VPS 关 SSH 密码登录（只允许 SSH key）
- [ ] 设 Anthropic 用量上限告警（防止 abuse 烧账单）

**应做**：
- [ ] 加 Sentry / 类似 error tracking
- [ ] 加 Grafana / Plausible 看埋点表
- [ ] 给 CRISIS_HOTLINES 配置一个法务确认过的列表
- [ ] 隐私政策页面 + 用户协议页面（CLAUDE.md §20 上线检查清单要求）

**可选**：
- [ ] 抖音小程序迁移（CLAUDE.md 一开始就规划过）
- [ ] 多模型支持（目前只支持 Anthropic Messages API）
- [ ] 真实流式（不再 buffer-then-replay）

---

## 附录 A：环境变量完整清单

`apps/api/.env`：

```env
NODE_ENV=production

# AI Provider — anthropic | openai | deepseek | qwen | zhipu | custom
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...           # AI_PROVIDER=anthropic 时必填
OPENAI_API_KEY=                        # AI_PROVIDER ∈ openai/deepseek/qwen/zhipu/custom 时必填
OPENAI_BASE_URL=                       # 可选：覆盖 provider 默认 URL；AI_PROVIDER=custom 时必填
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=1024
INTAKE_TIMEOUT_MS=10000

# DB
DATABASE_URL=postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres
DATABASE_SSL=true

# Redis (可选)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# JWT
JWT_SECRET=<48-byte base64url, 由 setup.sh 自动生成>
JWT_EXPIRES_IN=7d
JWT_REFRESH_GRACE_SECONDS=2592000

# 服务端
HOST=127.0.0.1                         # 只在 localhost,Nginx 代理出去
PORT=3000
CORS_ORIGIN=https://emotion-companion.vercel.app   # 严格相等,无尾斜杠
MAX_REQUESTS_PER_MINUTE=60
ENABLE_SAFETY_GUARD=true
LOG_LEVEL=info

# 可选: critical 文案覆盖
# CRISIS_HOTLINES_OVERRIDE="热线1 400-xxx;热线2 010-xxx"
```

`apps/web` 的环境变量（在 Vercel 设置）：

```env
VITE_API_BASE_URL=https://api.botjive.net
```

> ⚠️ `VITE_` 前缀变量会被打包进前端 bundle，**绝对不能放任何密钥**。

---

## 附录 B：开发常用命令

```bash
# 安装依赖
pnpm install

# 启动前后端（并行）
pnpm run dev

# 单独启动后端
pnpm --filter @emotion/api run dev

# 单独启动前端
pnpm --filter @emotion/web run dev

# 全栈类型检查
pnpm run typecheck

# 全栈测试
pnpm run test

# 单包测试
pnpm --filter @emotion/api run test
pnpm --filter @emotion/safety run test

# 数据库迁移（本地连 Supabase）
pnpm --filter @emotion/api run db:migrate

# 前端构建
pnpm --filter @emotion/web run build
```

---

## 附录 C：参考文档

- **CLAUDE.md** — 项目铁律（最高优先级，覆盖所有技术决策）
- **scripts/vps/README.md** — VPS 部署完整文档
- **Anthropic Messages API** — https://docs.anthropic.com/en/api/messages
- **Fastify** — https://fastify.dev
- **pnpm Workspace** — https://pnpm.io/workspaces
- **Vite** — https://vitejs.dev
- **Vitest** — https://vitest.dev
- **Zustand** — https://zustand-demo.pmnd.rs
- **Tailwind CSS** — https://tailwindcss.com

---

## 维护记录

| 日期 | 改动 | 责任人 |
|---|---|---|
| 2026-04-08 | 初次完整整理，覆盖 Phase 0-7 全部架构 | Phase 7 部署完成时 |
| 2026-04-09 | Phase 7+ 维护期更新：智能融合层 ActionCard 持久化（`structured_json._actionCard` + hydrate 重建）；analysis/coach 引入 `skipTextReplay`，DB 写占位符避免文字与卡片重复；tong-analysis parser 增加截断抢救路径 + maxTokens 升 4096；orchestrator 输出统一过 `sanitizeText`（只过滤 U+FFFD 与控制字符，emoji 放行）；guard 内置 `sanitizeForGuard`；message-coach / companion-response prompt 硬性禁 emoji；`AnalysisResultSchema.tone` 恢复严格 enum；前端全站字号统一 + ChatPage 顶栏导航修复 | 维护轮 |
| 2026-04-09 | Section 三 重写为「系统架构与部署拓扑」7 张详细架构图：3.1 部署拓扑（四层物理视图）/ 3.2 后端进程内部架构 / 3.3 Monorepo 包依赖 DAG / 3.4 POST /api/chat/stream 请求生命周期序列图（13 步）/ 3.5 智能融合层 ActionCard 数据流（流式 vs hydrate 双路径）/ 3.6 数据库 ER 简图 / 3.7 Orchestrator 决策状态机 | 维护轮 |

> 后续每个 Phase 完成或重大架构调整后，请在此追加一行。
