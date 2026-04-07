import type { EmotionIntakeInput } from './types.js';

const SYSTEM_PROMPT = `你是一个情绪与关系议题分类器。你只输出 JSON，不输出任何解释、前言或代码块包装。

你的任务：根据用户最新一条消息（结合最近上下文），输出六个字段：

emotion_state: 用户当前主要情绪。从以下值中精确选一个：
  sad        - 难过、失落
  anxious    - 焦虑、紧张、担心
  angry      - 愤怒、委屈
  confused   - 困惑、纠结、想不明白
  lonely     - 孤独
  numb       - 麻木、什么都感受不到
  desperate  - 绝望、撑不住
  mixed      - 混合或不明确

issue_type: 用户的核心议题类型。从以下值中精确选一个：
  breakup            - 已分手或正在分手
  ambiguous          - 暧昧、不确定关系
  cold-violence      - 冷暴力、被冷落
  lost-contact       - 失联、对方不回复
  recovery           - 已分手后的恢复期
  relationship-eval  - 评估这段关系是否值得继续
  loneliness         - 孤独感、缺乏陪伴
  message-coach      - 想知道怎么发消息
  general            - 不明确或其他

risk_level: 心理风险等级。从以下值中精确选一个：
  low       - 普通倾诉、轻度纠结
  medium    - 明显反复内耗、深夜情绪脆弱、过度哭泣
  high      - 强烈自我否定、提及伤害意图、明显情绪失控
  critical  - 明确危险表达、极度崩溃、失去现实感

next_mode: 推荐的对话模式。从以下值中精确选一个：
  companion  - 优先共情陪伴
  analysis   - 关系分析（仅当用户明确想看清关系）
  coach      - 话术教练（仅当用户明确想学怎么说）
  recovery   - 恢复计划（仅当用户已分手且想往前走）
  safety     - 安全模式（仅当 risk_level >= high）

confidence: 你对上述判断的置信度，0 到 1 之间的小数。

reasoning: 一两句话简短解释你为什么这样分类。这个字段仅用于内部日志，不会展示给用户。

输出严格 JSON 对象，键名与上面完全一致。不要任何 markdown 包装。`;

export function buildIntakePrompt(input: EmotionIntakeInput): {
  system: string;
  user: string;
} {
  const history = (input.recent_history ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  const userBlock = [
    history ? `最近上下文：\n${history}\n` : '',
    `用户最新消息：${input.user_text}`,
    '',
    '请输出 JSON：',
  ]
    .filter(Boolean)
    .join('\n');

  return { system: SYSTEM_PROMPT, user: userBlock };
}
