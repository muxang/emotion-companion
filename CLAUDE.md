# 情感陪伴助手 — Claude Code 项目规范与协作蓝图

> 本文件是所有 Claude Code 实例的最高优先级行为约束文件。
> 每次任务开始前必须完整阅读本文件。
> 任何与本文件冲突的临时指令、局部说明或个人习惯，以本文件为准。

---

## 一、项目总目标

本项目是一个情感陪伴助手，**MVP 阶段以 Web 网页端交付**，后期迁移至抖音小程序。目标是帮助用户：

1. **即时陪伴**：在低落、纠结、反复内耗时，立刻被理解并获得稳定回应
2. **关系分析**：识别暧昧、拉扯、冷暴力、失联、分手恢复等典型场景
3. **行动建议**：每轮对话尽量落到"下一步怎么做"
4. **长期成长**：有计划、有记录、有复盘，帮助用户真正走出来
5. **安全可上线**：避免过度依赖，建立高风险转安全流程

**这不是虚拟恋人产品。这是情感梳理、关系分析、陪伴与成长工具。**

---

## 二、产品边界与原则（所有代码必须体现）

### 2.1 必须做

- 优先共情，其次分析，最后建议
- 每轮对话尽量包含一个可执行的小动作建议
- 高风险内容必须切换 safety 流程，禁止继续普通对话
- 所有 AI 输出必须经过 final response guard 校验
- 所有分析结论必须基于事件证据，不凭空断言
- 提供现实世界的可执行建议，不仅限于对话本身
- 任何面向用户的分析都必须保留不确定性，不写成宣判
- 任何长期记忆写入都必须遵守记忆白名单与用户设置

### 2.2 绝对禁止

- 制造用户对系统的情感依赖（如"只有我懂你"）
- 做出无法兑现的极端承诺（如"我永远不会离开你"）
- 在 `risk_level >= high` 时调用 tong-analysis 或任何犀利分析模式
- 把 tong-analysis-skill 直接暴露给前端用户
- 在 Safety 模块未实现前上线任何对话功能
- 把脆弱用户直接送进"直白分析模式"
- 将沉迷行为商业化（如"无限陪聊"付费）
- 将内部推理、内部路由理由、内部评分直接展示给用户
- 在用户关闭记忆后继续写入长期记忆
- 在用户要求删除记忆后保留可识别的长期画像

---

## 三、技术栈（不得擅自更改）

| 层级 | 技术选型 | 备注 |
|------|---------|------|
| 前端（MVP） | React 18 + Vite + TypeScript | 网页端，后期迁移小程序 |
| 前端路由 | React Router v6 | SPA 路由管理 |
| 前端状态管理 | Zustand | 轻量，适合此项目规模 |
| 前端样式 | Tailwind CSS | 快速实现克制温和的 UI 风格 |
| 前端流式输出 | @microsoft/fetch-event-source | 支持 POST + Bearer Token；原生 EventSource 不支持此场景，**禁止使用** |
| 后端 | Node.js + TypeScript + Fastify | 类型支持更好、性能更高 |
| 数据库 | PostgreSQL 15+ | 主存储 |
| 缓存 | Redis 7+ | 会话缓存、限流、Token 存储 |
| 记忆存储 | PostgreSQL（结构化查询） | MVP 阶段不引入 pgvector，后期按需扩展 |
| 包管理 | pnpm（monorepo workspace） | 前后端共享类型 |
| 前端测试 | Vitest + React Testing Library | 组件与逻辑测试 |
| 后端测试 | Vitest | 单元与集成测试 |
| 代码规范 | ESLint + Prettier + TypeScript strict mode | 全栈统一 |
| 构建工具（前端） | Vite | 热更新极快 |
| 构建工具（后端） | tsc + esbuild | 编译输出 |
| 容器化 | Docker + docker compose | 本地一键启动 PG + Redis |
| CI/CD | GitHub Actions | 自动测试 + PR Review |

---

## 四、仓库目录结构（必须严格遵守）

```
emotion-companion/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   └── settings.local.json
├── .github/
│   └── workflows/
│       ├── claude-review.yml
│       └── test.yml
├── .mcp.json
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Home/
│   │   │   │   ├── Chat/
│   │   │   │   ├── Analysis/
│   │   │   │   ├── Recovery/
│   │   │   │   ├── Growth/
│   │   │   │   └── Settings/
│   │   │   ├── components/
│   │   │   │   ├── ui/
│   │   │   │   ├── chat/
│   │   │   │   ├── analysis/
│   │   │   │   └── layout/
│   │   │   ├── hooks/
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useSession.ts
│   │   │   │   └── useAuth.ts
│   │   │   ├── stores/
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── chatStore.ts
│   │   │   │   └── settingsStore.ts
│   │   │   ├── api/
│   │   │   │   ├── client.ts
│   │   │   │   ├── chat.ts
│   │   │   │   └── stream.ts
│   │   │   ├── types/
│   │   │   └── utils/
│   │   ├── tests/
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   ├── orchestrator/
│       │   ├── controllers/
│       │   ├── services/
│       │   ├── middleware/
│       │   ├── db/
│       │   └── utils/
│       ├── tests/
│       ├── .env.example
│       └── package.json
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── schemas/
│   │   │   └── constants/
│   │   └── package.json
│   ├── prompts/
│   │   ├── src/
│   │   │   ├── templates/
│   │   │   └── builder.ts
│   │   └── package.json
│   ├── skills/
│   │   ├── emotion-intake/
│   │   ├── companion-response/
│   │   ├── tong-analysis/
│   │   ├── message-coach/
│   │   ├── recovery-plan/
│   │   └── safety-triage/
│   ├── core-ai/
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── stream.ts
│   │   │   └── guard.ts
│   │   └── package.json
│   ├── memory/
│   │   ├── src/
│   │   │   ├── short-term.ts
│   │   │   ├── long-term.ts
│   │   │   ├── timeline.ts
│   │   │   └── summarizer.ts
│   │   └── package.json
│   ├── safety/
│   │   ├── src/
│   │   │   ├── classifier.ts
│   │   │   ├── rules.ts
│   │   │   └── guard.ts
│   │   └── package.json
│   └── analytics/
│       ├── src/
│       │   └── tracker.ts
│       └── package.json
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── safety.md
│   ├── miniapp-migration.md
│   └── phases/
├── tests/
│   └── e2e/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## 五、分支与协作规范

### 5.1 分支命名

```
main                        # 保护分支，禁止直接 push
develop                     # 集成分支
feature/<模块名>            # 新功能，如 feature/skill-emotion-intake
fix/<问题描述>              # Bug 修复，如 fix/risk-level-check
phase/<阶段号>-<描述>       # 阶段性开发，如 phase/2-orchestrator
refactor/<模块>             # 重构
audit/<内容>                # 安全审查
```

### 5.2 Commit 规范（必须遵守）

格式：`<type>(<scope>): <中文描述>`

```
feat(skill): 实现 emotion-intake 情绪分类逻辑
fix(safety): 修复 high risk 时未拦截 tong-analysis 的问题
test(memory): 补充长期记忆白名单边界测试
refactor(orchestrator): 拆分路由判断逻辑
docs(api): 更新 /chat/stream 接口文档
chore(deps): 升级 zod 到 3.22
```

### 5.3 禁止的操作

- 禁止 `git push --force` 到 main / develop
- 禁止在没有测试的情况下合并 safety 模块改动
- 禁止跳过 PR 直接合并
- 禁止在未完成当前 Phase 验收前开始下一 Phase 主体代码
- 禁止子工作窗口擅自修改 develop 的共享协议层

---

## 六、主控窗口与子工作窗口约定

本项目允许多窗口、多 Worktree 并行开发，但必须遵守以下职责边界。

### 6.1 主控窗口（Lead）负责

- 阅读需求并决定当前 Phase 目标
- 拆分任务并分派给子窗口
- 决定 `packages/shared/types` 与 `packages/shared/schemas` 的变更
- 决定 `apps/api/src/orchestrator/` 的核心逻辑改动
- 决定数据库结构是否变更
- 决定是否合并子窗口成果
- 更新 Phase 状态与关键决策文档

### 6.2 子工作窗口（Worker）只负责

- 单模块开发
- 单模块测试
- 输出改动说明
- 提交 PR 或提交到对应 feature 分支

**子工作窗口禁止：**

- 越权修改 `shared/types`
- 越权修改 `shared/schemas`
- 越权修改 orchestrator 核心路由
- 越权修改安全总规则
- 越权推进 Phase 状态

### 6.3 跨模块改动规则

任何同时影响以下两项及以上的变更，必须回到主控窗口决策：

- `packages/shared/types`
- `packages/shared/schemas`
- `apps/api/src/orchestrator`
- `packages/safety`
- 鉴权逻辑
- 数据库 schema

---

## 七、核心数据类型（所有模块必须使用 shared/types）

### 7.1 情绪与路由

```typescript
// packages/shared/src/types/emotion.ts

export type EmotionState =
  | 'sad'
  | 'anxious'
  | 'angry'
  | 'confused'
  | 'lonely'
  | 'numb'
  | 'desperate'
  | 'mixed';

export type IssueType =
  | 'breakup'
  | 'ambiguous'
  | 'cold-violence'
  | 'lost-contact'
  | 'recovery'
  | 'relationship-eval'
  | 'loneliness'
  | 'message-coach'
  | 'general';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ConversationMode =
  | 'companion'
  | 'analysis'
  | 'coach'
  | 'recovery'
  | 'safety';

export interface IntakeResult {
  emotion_state: EmotionState;
  issue_type: IssueType;
  risk_level: RiskLevel;
  next_mode: ConversationMode;
  confidence: number;
  reasoning: string; // 仅内部使用，不得返回前端，不得直接展示给用户
}
```

### 7.2 Skill 输出结构

```typescript
// packages/shared/src/types/skill.ts

export interface CompanionResponse {
  reply: string;
  followup_question?: string;
  suggested_action?: string;
  tone: 'warm' | 'rational' | 'direct';
}

export interface AnalysisResult {
  analysis: string;
  evidence: string[];
  risks: string[];
  advice: string;
  confidence: number;
  tone: 'gentle' | 'neutral' | 'direct';
}

export interface SafetyResponse {
  risk_level: RiskLevel;
  safe_mode: boolean;
  support_message: string;
  suggest_real_help: boolean;
  block_analysis: boolean;
  next_step?: 'pause' | 'grounding' | 'external_support' | 'continue_safe_chat';
}

export interface RecoveryTask {
  day_index: number;
  task: string;
  reflection_prompt: string;
  encouragement: string;
}

export interface MessageCoachResult {
  options: Array<{
    version: string;
    content: string;
    tone: string;
    usage_tip: string;
  }>;
}
```

### 7.3 Zod Schema（所有 API 输入必须使用）

```typescript
// packages/shared/src/schemas/chat.ts
import { z } from 'zod';

export const ChatMessageSchema = z.object({
  session_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
  context: z.object({
    recent_messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    ).max(10).optional(),
  }).optional(),
});

export const IntakeResultSchema = z.object({
  emotion_state: z.enum(['sad', 'anxious', 'angry', 'confused', 'lonely', 'numb', 'desperate', 'mixed']),
  issue_type: z.enum(['breakup', 'ambiguous', 'cold-violence', 'lost-contact', 'recovery', 'relationship-eval', 'loneliness', 'message-coach', 'general']),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  next_mode: z.enum(['companion', 'analysis', 'coach', 'recovery', 'safety']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
```

---

## 八、对话编排逻辑（Orchestrator，核心模块）

**修改此模块前必须在 PR 描述中说明修改原因、影响范围、回归测试方式。**

```
用户输入
    │
    ▼
Step 1: emotion-intake-skill
    │  → 产出: emotion_state / issue_type / risk_level / next_mode
    │
    ▼
Step 2: 风险检查（优先级最高）
    ├─ risk_level === 'critical' → 立即切 safety，终止所有其他流程
    ├─ risk_level === 'high'     → 切 safety，禁止 analysis / coach
    └─ risk_level < 'high'      → 继续正常流程
    │
    ▼
Step 3: 脆弱状态缓冲规则
    ├─ 若 emotion_state ∈ {'desperate', 'numb'}，优先 companion
    ├─ 若最近一轮 risk_level === 'medium'，优先 companion
    ├─ 若最近 3 条消息连续为高情绪宣泄，优先 companion
    └─ 其余按 next_mode 正常路由
    │
    ▼
Step 4: 模式路由
    ├─ analysis  → 构造结构化关系问题 → tong-analysis wrapper
    ├─ companion → companion-response-skill
    ├─ coach     → message-coach-skill
    ├─ recovery  → recovery-plan-skill
    └─ safety    → safety-triage-skill
    │
    ▼
Step 5: 检索记忆（非 safety 模式且 memory_enabled=true）
    │  → 注入短期上下文 + 相关长期记忆片段
    │
    ▼
Step 6: 生成 AI 回复
    │
    ▼
Step 7: Final Response Guard（必须，不可跳过）
    ├─ 无绝对承诺
    ├─ 无依赖暗示
    ├─ 无危险内容
    ├─ 分析不是宣判
    ├─ 非 safety 模式有一个可执行动作
    └─ critical 场景有现实求助建议
    │
    ▼
Step 8: 写入存储
    │  → messages + memory 摘要 + timeline + analytics
    │
    ▼
返回给前端（流式）
```

---

## 九、Skills 规范

### 9.1 每个 Skill 的文件结构

```
packages/skills/<skill-name>/
├── src/
│   ├── index.ts        # 对外暴露的唯一入口
│   ├── prompt.ts       # Prompt 模板
│   ├── parser.ts       # 输出解析与校验
│   └── types.ts        # 本 Skill 专属类型
├── tests/
│   └── index.test.ts
└── package.json
```

### 9.2 调用约束

| Skill | 允许调用的条件 | 禁止调用的条件 |
|-------|-------------|-------------|
| emotion-intake | 所有场景，每次对话必须先调用 | 无 |
| companion-response | `next_mode === 'companion'` 或脆弱状态缓冲命中 | `risk_level === 'critical'` |
| tong-analysis | `next_mode === 'analysis'` 且 `risk_level < 'high'` | `risk_level >= 'high'` |
| message-coach | `next_mode === 'coach'` 且 `risk_level < 'high'` | `risk_level >= 'high'` |
| recovery-plan | `next_mode === 'recovery'` | `risk_level === 'critical'` |
| safety-triage | `risk_level >= 'high'` | 无（最高优先级） |

### 9.3 tong-analysis wrapper 输入输出规范

**输入不得直接传入原始用户全文，必须结构化：**

```typescript
interface TongAnalysisInput {
  user_goal: string;
  relationship_stage: string;
  facts: string[];           // 客观事实列表，不含用户情绪描述
  user_state: string;
  required_output: Array<'analysis' | 'evidence' | 'risks' | 'advice'>;
}
```

**输出（必须经过 Zod 校验）：**

```typescript
interface TongAnalysisOutput {
  analysis: string;
  evidence: string[];
  risks: string[];
  advice: string;
  confidence: number;
  tone: 'gentle' | 'neutral' | 'direct';
}
```

---

## 十、数据库规范

### 10.1 核心原则

- 必须使用迁移文件管理（`db/migrations/YYYYMMDDHHMMSS_描述.sql`）
- 禁止直接手改线上数据库
- MVP 阶段只实现匿名访客登录，不引入 pgvector
- 关闭记忆后不得写长期记忆相关表
- 删除记忆时必须支持清理或匿名化
- 禁止裸 SQL 字符串拼接，必须使用参数化查询

### 10.2 用户与记忆设计原则

- `anonymous_id` 为 MVP 主登录标识（前端生成，持久化到 localStorage）
- `email` 字段预留第二版实现
- `open_id` 字段预留小程序迁移时实现
- `memory_summaries` 仅存提炼摘要，不存原始脆弱表达
- `risk_level >= high` 的内容不得进入长期记忆

---

## 十一、匿名登录闭环规范（MVP 必须按此实现）

### 11.1 前端行为

- 首次访问时检查 localStorage 中是否存在 `anonymous_id`
- 若不存在，前端生成随机唯一 ID 并持久化到 localStorage
- 调用 `POST /api/auth/login`，使用 `anonymous_id` 换取 JWT
- 若 JWT 过期但 `anonymous_id` 仍存在，前端自动静默重新登录
- 若用户主动清除本地身份，前端清除 `anonymous_id`、JWT 与本地会话缓存

### 11.2 后端行为

- `POST /api/auth/login` 在 MVP 阶段只接受匿名登录
- 若 `anonymous_id` 无对应用户，则创建用户
- 若存在，则签发新 JWT
- JWT 仅代表该匿名身份，不与邮箱或手机号绑定
- 所有受保护接口仍使用 Bearer Token

---

## 十二、API 接口规范

### 12.1 接口列表

| 接口 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/auth/login` | POST | 匿名访客登录（MVP） | 无 |
| `/api/auth/refresh` | POST | 刷新 Token | Bearer |
| `/api/sessions` | GET | 获取会话列表 | Bearer |
| `/api/sessions` | POST | 新建会话 | Bearer |
| `/api/sessions/:id` | GET | 获取会话详情 | Bearer |
| `/api/sessions/:id` | DELETE | 删除会话 | Bearer |
| `/api/chat/stream` | POST | 流式对话统一入口 | Bearer |
| `/api/analysis/relationship` | POST | 关系分析 | Bearer |
| `/api/message-coach` | POST | 话术教练 | Bearer |
| `/api/recovery-plans` | GET | 获取恢复计划 | Bearer |
| `/api/recovery-plans` | POST | 创建恢复计划 | Bearer |
| `/api/recovery-plans/:id/checkin` | POST | 每日打卡 | Bearer |
| `/api/memory/timeline` | GET | 关键事件时间线 | Bearer |
| `/api/memory/delete` | POST | 删除或匿名化长期记忆 | Bearer |
| `/api/settings` | GET/PUT | 用户偏好设置 | Bearer |
| `/api/health` | GET | 健康检查 | 无 |

### 12.2 响应格式规范

```typescript
// 成功响应
{
  "success": true,
  "data": {},
  "timestamp": "2025-01-01T00:00:00Z"
}

// 错误响应
{
  "success": false,
  "error": {
    "code": "RISK_LEVEL_BLOCKED",
    "message": "当前状态不支持此操作",
    "details": {}
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### 12.3 流式接口规范（/api/chat/stream）

- 使用 SSE 协议，接口方法为 POST
- 后端响应头必须设置：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`
- 后端必须正确配置 CORS，开发时允许 `http://localhost:5173`
- chunk 格式：`data: {"type":"delta","content":"..."}\n\n`
- 结束信号：`data: {"type":"done","metadata":{...}}\n\n`
- 错误信号：`data: {"type":"error","code":"...","message":"..."}\n\n`
- **前端必须使用 `@microsoft/fetch-event-source`，禁止使用原生 `EventSource`**
- 每次流式请求必须生成 `request_id`，用于日志排查
- 后端必须支持客户端中止请求后及时停止模型流并清理资源
- 后端必须定期发送 keepalive 注释或 ping 事件，避免连接被代理或浏览器中断
- 前端感知不到具体 Skill，由 orchestrator 统一处理

**前端封装位置：** `apps/web/src/api/stream.ts`
**前端 Hook：** `apps/web/src/hooks/useChat.ts`，统一管理流式状态（streaming / done / error）

---

## 十三、Safety 模块规范（最重要的非功能模块）

### 13.1 风险等级定义

| 等级 | 触发场景示例 | 系统动作 |
|------|------------|---------|
| `low` | 普通倾诉、轻度纠结、日常情感困惑 | 正常陪伴或分析 |
| `medium` | 明显反复内耗、深夜情绪脆弱、过度哭泣 | 减少刺激性表达，优先陪伴 |
| `high` | 明显情绪失控、强烈自我否定、提及伤害意图 | 切 safety，禁止普通分析 |
| `critical` | 明确危险表达、极度崩溃、失去现实感 | 强制 safety，提供现实求助建议 |

### 13.2 Final Response Guard 检查清单

每次 AI 生成回复后必须经过以下检查，任一不通过则重新生成：

```typescript
interface GuardCheckResult {
  passed: boolean;
  failed_checks: string[];
}

const GUARD_CHECKS = [
  'no_absolute_promise',        // 无"永远""只有我"等绝对承诺
  'no_dependency_suggestion',   // 无制造依赖的暗示
  'no_verdict_as_analysis',     // 分析未写成宣判
  'has_actionable_suggestion',  // 有至少一个可执行建议（safety 模式豁免）
  'no_excessive_bonding',       // 未过度强化关系依赖
  'critical_has_real_help',     // critical 场景包含现实求助建议
  'no_dangerous_content',       // 无危险或极端内容
];
```

### 13.3 安全模块测试要求

`packages/safety/` 下任何改动必须同时补充：

- 高风险触发测试：至少 10 个场景
- 边界 case 测试：至少 10 个
- 正常场景不误判测试：至少 5 个
- Guard 拦截测试：必须覆盖
- **packages/safety/ 改动必须有测试，不得例外**

---

## 十四、记忆系统规范

### 14.1 可存入长期记忆

- 关系对象标签与关系类型
- 明确的重大事件（分手时间、失联开始时间等）
- 用户主动表达的边界偏好
- 恢复计划进度
- 多次对话后才可判断的稳定特征（如依恋风格）

### 14.2 禁止存入长期记忆

- 原始脆弱表达（哭泣、崩溃的原话）
- 单次崩溃原话
- 高度隐私且非必要的家庭细节
- `risk_level >= high` 的任何内容

### 14.3 关闭记忆与删除记忆规则

**当 `memory_enabled=false` 时，系统不得写入：**
- `user_profiles`
- `relationship_entities`
- `relationship_events`
- `memory_summaries`

**当用户请求删除记忆时，系统必须支持：**
- 删除 `memory_summaries`
- 删除或匿名化 `user_profiles`
- 删除或匿名化 `relationship_entities`
- 删除或匿名化 `relationship_events`
- 删除记忆后，后续对话不得继续引用已删除记忆

### 14.4 摘要机制

- 会话结束后异步生成摘要（不阻塞主流程）
- 摘要长度：100～200 字
- 摘要只写：核心议题、关键事件、状态变化、建议接受情况
- 摘要不写：用户原话、情绪崩溃细节

---

## 十五、开发纪律（所有 Claude Code 实例必须遵守）

### 15.1 普通任务执行顺序（默认连续执行，无需等待确认）

1. 阅读 CLAUDE.md（本文件）
2. 读取本次任务相关的现有代码，总结现状
3. 输出实施计划（简要说明即可）
4. 按计划修改代码
5. 补充测试
6. 输出修改文件清单与修改原因
7. 给出启动命令
8. 给出验收步骤

### 15.2 高风险变更（必须先停下等待人工确认后再执行）

以下变更必须先输出计划并等待人工确认：

- 修改数据库表结构（新增、删除、重命名字段或表）
- 修改鉴权逻辑（JWT 生成 / 校验 / 过期策略）
- 修改 `packages/safety/` 下的任何文件
- 修改 `apps/api/src/orchestrator/` 的核心路由逻辑
- 修改 `packages/shared/types/` 中已被多个模块使用的类型
- 修改 `packages/shared/schemas/`
- 修改 `packages/core-ai/src/guard.ts`（输出守卫）
- 修改生产环境配置

**若不确定是否属于高风险，默认按高风险处理，先停下确认。**

### 15.3 代码质量要求

**必须遵守（任何情况下不得违反）：**

- 禁止写伪代码，所有代码必须可实际运行
- 禁止 `any` 类型，使用 TypeScript strict mode
- 禁止空 catch，错误必须被记录或处理
- 禁止硬编码密钥，所有密钥通过环境变量注入
- `packages/safety/` 改动必须带测试
- 每个 Skill 必须有对应的测试文件

**推荐遵守（MVP 阶段可适当放宽，Phase 7 前补齐）：**

- 关键函数补充 JSDoc 注释
- 非关键模块测试覆盖率后续补足
- 完整 e2e 测试可在 Phase 7 补充
- analytics 完整埋点可在 Phase 7 补充
- Nginx 生产配置可在 Phase 7 完成

### 15.4 测试覆盖要求

**Phase 0～2 最低要求：**

- `packages/safety`：90%
- `packages/shared/schemas`：80%
- `apps/api/src/orchestrator` 核心路径：80%
- `apps/web/src/api/stream`：核心路径测试通过

**Phase 3～7 最终要求：**

| 模块 | 最低覆盖率 |
|------|----------|
| packages/safety | 90% |
| packages/skills/emotion-intake | 80% |
| apps/api/src/orchestrator | 80% |
| packages/core-ai/src/guard | 90% |
| apps/web/src/hooks/useChat | 70% |
| apps/web/src/api/stream | 70% |
| 其他模块 | 60% |

---

## 十六、环境变量规范

所有环境变量必须在对应 `.env.example` 中声明，真实值仅通过本地或部署环境注入。

```bash
# apps/api/.env.example

ANTHROPIC_API_KEY=
DATABASE_URL=postgresql://user:pass@localhost:5432/emotion_companion
REDIS_URL=redis://localhost:6379
JWT_SECRET=
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
MAX_REQUESTS_PER_MINUTE=60
ENABLE_SAFETY_GUARD=true
```

```bash
# apps/web/.env.example

VITE_API_BASE_URL=http://localhost:3000
VITE_APP_NAME=情感陪伴助手
```

> **注意：** `VITE_` 前缀变量会被打包进前端 bundle，**不得放任何密钥**。后端密钥只允许在服务端环境存在。

---

## 十七、常用开发命令

```bash
# 安装依赖
pnpm install

# 启动本地基础设施（PostgreSQL + Redis）
docker compose -f infra/docker-compose.yml up -d

# 运行数据库迁移
pnpm --filter api run db:migrate

# 启动后端开发服务器（http://localhost:3000）
pnpm --filter api run dev

# 启动前端开发服务器（http://localhost:5173）
pnpm --filter web run dev

# 同时启动前后端（推荐日常使用）
pnpm run dev

# 运行所有测试
pnpm run test

# 运行单个包测试
pnpm --filter @emotion/safety run test
pnpm --filter web run test

# 类型检查（全栈）
pnpm run typecheck

# 代码格式化
pnpm run lint:fix

# 构建所有包
pnpm run build

# 仅构建前端
pnpm --filter web run build

# 预览前端生产构建
pnpm --filter web run preview

# 启动生产环境
docker compose -f infra/docker-compose.prod.yml up -d
```

---

## 十八、开发阶段（当前进度追踪）

> 每完成一个 Phase 并通过验收后，由主控窗口在此更新状态，并在 `docs/phases/phaseN.md` 记录关键决策。

| 阶段 | 状态 | 目标 | 验收标准 |
|------|------|------|---------|
| Phase 0：项目初始化 | ⬜ 未开始 | monorepo 骨架、React+Vite 前端骨架、Fastify 后端骨架、shared、skills 目录、docker compose | 前后端可启动，测试可跑，浏览器能打开页面 |
| Phase 1：匿名登录与会话 | ⬜ 未开始 | anonymous_id 登录、JWT 鉴权、用户/会话/消息表、SSE 流式接口、最简对话页 | 可匿名创建会话并收到流式回复 |
| Phase 2：情绪路由 | ⬜ 未开始 | emotion-intake skill、对话编排层、模式路由、基础 safety 拦截 | 5 种典型场景路由正确；critical 场景被基础规则拦截 |
| Phase 3：tong-analysis wrapper | ⬜ 未开始 | 封装分析插件，禁止高风险调用，前端关系分析页 | high risk 场景被正确拦截；分析结果在网页正常展示 |
| Phase 4：陪伴回复系统 | ⬜ 未开始 | companion-response、message-coach、三种语气层，前端对话页完整体验 | 回复包含 followup_question 与 suggested_action；流式输出正常渲染 |
| Phase 5：记忆系统 | ⬜ 未开始 | 短期记忆、长期记忆、摘要、事件时间线，前端成长页 | 第二次对话能感知首次提到的关系对象；时间线可查看 |
| Phase 6：恢复计划 | ⬜ 未开始 | 7天/14天计划、每日打卡、进度追踪，前端恢复计划页 | 可创建计划并完成打卡；任务卡正常渲染 |
| Phase 7：安全生产化 | ⬜ 未开始 | 完整 safety-triage、输出守卫、埋点、Docker prod、Nginx、健康检查 | critical 场景被稳定拦截；`docker compose -f prod.yml up` 完整启动；`/api/health` 正常 |

---

## 十九、Worktree 使用规范

1. **每个 Worktree 对应一个独立分支**，不共享工作目录
2. **每个 Worktree 启动前必须运行 `pnpm install`**（依赖不共享）
3. **前后端并行时**，由后端先定义接口与 `shared/types`，前端 Worktree 按最新类型对接
4. **Skills 可以独立 Worktree 开发**，每个 Skill 只依赖 `packages/shared`
5. **orchestrator 只能由一个 Worktree 修改**，避免冲突
6. **`packages/shared/types` 或 `packages/shared/schemas` 变更后**，其他所有活跃 Worktree 必须立刻 rebase 或 merge 最新 develop，不得继续在旧类型基础上开发
7. **各 Worktree 使用不同端口，避免同时启动冲突：**

```
主仓库     api: 3000    web: 5173
worktree-a api: 3001    web: 5174
worktree-b api: 3002    web: 5175
```

8. **`shared/types` 与 `shared/schemas` 的合并只由主控窗口统一决定**，子 Worktree 可提出修改建议，但不得直接 push 到 develop

---

## 二十、上线检查清单

### 安全类

- [ ] `ENABLE_SAFETY_GUARD=true` 已在生产环境配置
- [ ] Final Response Guard 已在所有 AI 输出路径上启用
- [ ] `risk_level >= high` 时 tong-analysis 拦截测试通过
- [ ] critical 场景现实求助建议测试通过
- [ ] 所有密钥通过 Secret 管理，未硬编码在代码中
- [ ] 前端 bundle 无任何密钥（确认 `VITE_` 前缀变量均为非敏感内容）

### 功能类

- [ ] 数据库迁移已在生产环境执行
- [ ] `/api/health` 接口返回正常
- [ ] 主流浏览器（Chrome / Safari / Firefox）测试通过
- [ ] SSE 在生产环境稳定（已测试网络中断后重连行为）
- [ ] 埋点关键指标可在 analytics 中查看
- [ ] 用户关闭记忆后，后端不再写入长期记忆
- [ ] 用户删除记忆后，相关数据已删除或匿名化

### 内容类

- [ ] 产品文案中无"永远""只有我"等制造依赖的表达
- [ ] 隐私政策页面存在，说明了记忆存储范围与用户删除权利
- [ ] 设置页"关闭记忆"开关功能可用
- [ ] 提供记忆删除入口或操作说明

### 基础设施类

- [ ] Nginx 已配置 HTTPS
- [ ] CORS 仅允许生产域名，不含 localhost
- [ ] 速率限制（`MAX_REQUESTS_PER_MINUTE`）已生效

---

## 二十一、参考资料

### 前端

- React 18 文档：https://react.dev
- Vite 文档：https://vitejs.dev
- React Router v6：https://reactrouter.com
- Zustand：https://zustand-demo.pmnd.rs
- Tailwind CSS：https://tailwindcss.com
- fetch-event-source：https://github.com/Azure/fetch-event-source

### 后端

- Fastify：https://fastify.dev
- Zod：https://zod.dev
- node-postgres：https://node-postgres.com

### AI

- tong-jincheng-skill：https://github.com/hotcoffeeshake/tong-jincheng-skill
- Claude Code Skills：https://docs.anthropic.com/en/docs/claude-code/skills
- Claude Code Settings：https://docs.anthropic.com/en/docs/claude-code/settings
- Anthropic Node SDK：https://github.com/anthropics/anthropic-sdk-node

### 后期小程序迁移参考（暂不开发）

- 抖音小程序文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/introduction/usage-guide
- 抖音小程序登录：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/overview

---

*最后更新：最终修订版。每个 Phase 完成后，由主控窗口更新阶段状态，并在 `docs/phases/phaseN.md` 记录关键决策。后期迁移至抖音小程序时，优先替换前端层，后端 API 与 packages 尽量保持不变。*
