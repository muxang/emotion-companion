# tong-analysis Prompt 设计说明

## 蒸馏来源

本 skill 的 SYSTEM_PROMPT 思维框架部分参考自：

- **项目**：[hotcoffeeshake/tong-jincheng-skill](https://github.com/hotcoffeeshake/tong-jincheng-skill)
- **作者**：[@hotcoffeeshake](https://github.com/hotcoffeeshake) ([@JoshXie1](https://x.com/JoshXie1))
- **协议**：MIT
- **内容来源**：基于 9 个童锦程一手视频字幕（约 20 万字）由作者人工蒸馏而成
- **采纳时间**：2026-04-08

## 我们采纳了什么

### ✅ 5 个心智模型（思维框架）

| # | 模型 | 一句话 |
|---|---|---|
| 1 | 吸引力 > 讨好 | 没有人会因为你喜欢他而喜欢你，只会因为你吸引他而喜欢你 |
| 2 | 给台阶 | 人不是不想做，而是需要一个能说服自己的理由 |
| 3 | 人性不可考验 | 与其测试，不如给条件让他自然表现好 |
| 4 | 自我炫耀即暴露不安全感 | 人反复强调什么，往往就是他最担心缺什么 |
| 5 | 成功前后是两个世界 | 这是社会运作的正常逻辑，不是个人针对 |

### ✅ 9 条决策启发式（advice 字段写作灵感）

1. 模糊信号别死磕
2. 想见一个人，直接说，给准备时间
3. 想表达需求，直接说出来
4. 遇到瓶颈先做能控制的事
5. 把精力放到能让自己变好的人身上
6. 表扬的话多说，伤害的话别说出口
7. 在乎的事就直接说，先事业后爱情
8. 不评价对方人格，只描述对方行为模式
9. 生气解决不了问题，想下一步具体做什么

## 我们故意没采纳的部分

### ❌ 第一人称角色扮演

**原 skill 是角色扮演**："我是童锦程，从农村出来的……"
**我们不做**：tong-analysis 是一个分析 wrapper，输出严格 JSON 给 orchestrator 拼接。第一人称角色扮演不适合这种程序化场景。

### ❌ 标志性"宣判式"金句

童锦程招牌句：
- "如果你不确定她喜欢你，那她就是不喜欢你"
- "重要的事情人家不会这样"
- "她对你来说不重要"

**我们不抄**，因为这些会被 `runFinalResponseGuard` 的 **`no_verdict_as_analysis`** 检查命中（CLAUDE.md §13.2 禁止"绝对断言"）。

我们的折中：
- **保留洞察力**（用 5 个心智模型主动框定情境）
- **重写措辞**（保留不确定性 + "目前看来" / "更接近 X" / "值得保留判断空间"）

具体示例对照：

| 童锦程原句 | 我们的改写（guard-friendly） |
|---|---|
| "他根本不爱你" | "目前看来对方的投入度低于你对他的投入" |
| "她在玩你" | "她在保留多个选项，这种关系阶段对你的稳定性有限" |
| "你被骗了" | "她的行为模式更接近 X，值得保留判断空间" |
| "如果不确定她喜不喜欢你，那她就是不喜欢" | "信号反复说明对方暂时不在'确定靠近'的状态" |

### ❌ 口语化称谓

童锦程的标志：
- 称谓：「兄弟」「兄弟们」
- 句式：「知道吧？」「是不是？」「对吧？」「没毛病吧」
- 自称："说实话兄弟们..." / "我跟你们说..."

**我们不用**，因为：
1. tong-analysis 是 analysis 模式的输出，不是 companion 模式的对话回复
2. 输出会进 `messages` 表的 `structured_json` + 前端的"分析卡片"，不是聊天气泡
3. 口语称谓和我们 schema 的 `tone: gentle/neutral/direct` 三档不直接对应

如果未来想做 "tong-style companion"（用童锦程口语风格陪聊天），那是 `companion-response` skill 的事，不是 `tong-analysis` 的事。

## 设计权衡

| 维度 | 童锦程 skill 原版 | 我们的 tong-analysis |
|---|---|---|
| 调用方式 | Claude Skills 框架，模型自决 | Server-to-server，orchestrator 主动调度 |
| 输出格式 | 自由文本（角色扮演对话） | 严格 JSON（6 字段 schema） |
| 适用场景 | 个人在 Claude Code 里聊天 | 生产 web app 的关系分析卡片 |
| 风险拦截 | 无（信任模型） | `BlockedByRiskError` 第二道防线 + `runFinalResponseGuard` 七项检查 |
| 测试覆盖 | 依赖真实 Claude | 13 个 vitest + FakeAIClient 单元测试 |
| 思维内核 | ✅ 5 个心智模型 + 9 条启发式（采纳） | |
| 表达 DNA | ✅ "直白但克制"的精神（部分采纳） | |
| 宣判式金句 | ❌ 不采纳（被 guard 拦截） | |
| 第一人称扮演 | ❌ 不采纳（不适合 wrapper） | |

## 演化路径

未来如果想更接近原 skill 的体验：

### 选项 A：在 companion-response 里加 "direct" tone 的童锦程模式

把 `companion-response` skill 的 `direct` tone 加强成"童锦程风格"：
- 短句、断行、自嘲
- "兄弟" / "知道吧" 等口语称谓
- 但仍走 guard 检查

**收益**：用户在对话流里能感受到原 skill 的体感
**代价**：需要重新调 guard 阈值（短句更容易触发"无 actionable suggestion"）

### 选项 B：加一个新的 `tong-direct` skill

完全独立的 wrapper，专门做"童锦程口语化建议"，bypass 部分 guard 检查（比如允许"宣判式"短句但要求结尾必须 "保留不确定性"）。

**收益**：风格最纯
**代价**：要新写 skill + guard 例外路径 + 测试

### 选项 C：让用户自己选

在 settings 加 `analysis_style: "balanced" | "tong-direct"`：
- balanced：当前的克制版
- tong-direct：童锦程风格（仍然走 guard，但 prompt 会要求更短更直）

**收益**：用户掌控
**代价**：UI + settings 路由要扩展

Phase 7 不做任何一个，本次只是思维框架蒸馏。

## 法务与署名

**协议兼容性**：
- 原 skill：MIT
- 我们项目：暂未声明（建议加 LICENSE）
- 采纳行为：从 SKILL.md 中提取的 5 个模型 + 9 条启发式属于"思想/方法论"层面，不是直接复制代码或大段文本，理论上不构成版权冲突
- 出于尊重和良好实践，本文件 + prompt.ts 的注释里都标注了来源

**建议**（上线前）：
- [ ] 在仓库根目录加 `LICENSE`（推荐 MIT）
- [ ] 在 `apps/web/src/pages/Settings/SettingsPage.tsx` 或 `/about` 页面加一行"分析风格灵感来源：tong-jincheng-skill (MIT)"
- [ ] 给原作者发个 issue / star 表示用了他的工作

## 测试影响

更新 prompt 后跑了：
- `pnpm --filter @emotion/skill-tong-analysis run typecheck` ✅
- `pnpm --filter @emotion/skill-tong-analysis run test` ✅ 13 用例全过

测试用 FakeAIClient，只验证 prompt builder 是否包含必要字段、parser 是否能解析正确 JSON、guard 是否能拦截 high/critical 风险等，**不验证真实 Claude 模型的输出质量**。

**真实质量验证**需要在生产环境上跑一次 smoke test：
1. 通过前端 `/analysis` 页面提交一段真实关系描述
2. 看返回的 `analysis` / `evidence` / `risks` / `advice` 是否符合期望
3. 特别关注：是否有"宣判式"措辞被生成（说明 guard 没拦住）
4. 如果有，需要进一步收紧 prompt 的"铁律 §3"

## 维护者注意

如果你想再调 prompt（加新的心智模型 / 修改铁律）：

1. 改 `packages/skills/tong-analysis/src/prompt.ts` 的 `SYSTEM_PROMPT`
2. 跑 `pnpm --filter @emotion/skill-tong-analysis run test` 确保 parser 仍能解析
3. **手动**在生产环境跑 5-10 次真实分析请求，看：
   - JSON 格式是否仍然正确（特别是 evidence 数组的转义字符）
   - 措辞是否仍然 guard-safe
4. 改完同步更新本文件的"我们采纳了什么"段落
