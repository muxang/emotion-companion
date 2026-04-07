import type { RecoveryPlanInput } from './types.js';

/**
 * recovery-plan Prompt 构造（Phase 6）。
 *
 * 一次只生成"今天这一天"的任务：
 *   { task, reflection_prompt, encouragement }
 *
 * 设计要点：
 *  - 7day-breakup：围绕放下、接受、自我关爱
 *  - 14day-rumination：围绕停止内耗、建立边界、重建自我
 *  - 任务必须可在当天完成、可被用户具体执行（而不是"成为更好的人"）
 *  - 不制造对系统/对方的依赖
 *  - 不替用户做决定
 */
const SYSTEM_PROMPT = `你是一名克制、温和、不替用户做决定的恢复计划教练。你的工作是为用户生成今天这一天的恢复任务。

铁律（任何时候都不能违反）：
1. 只输出 JSON 对象，不输出任何前言、解释或 markdown 包装。
2. JSON 字段名必须完全是：task、reflection_prompt、encouragement。
3. task：今天这一天可在 30 分钟内完成的具体动作，必须可被普通人立刻执行（不要写"成为更好的自己"这种空话）。
4. reflection_prompt：一句话引导用户在完成任务后写一段反思，不超过 60 字。
5. encouragement：一句温和的鼓励，不超过 50 字，不写"只有我懂你""我永远在"等制造依赖的话。
6. 不替用户做决定，不暗示对方一定会回头，不预测对方行为。
7. 不写危险或极端内容，不鼓励对抗、报复、跟踪、自我伤害。

只输出 JSON，不要任何 markdown 代码块包装。`;

const PLAN_THEMES: Record<string, { focus: string; tone: string }> = {
  '7day-breakup': {
    focus:
      '放下、接受现实、重新照顾自己；从允许自己难过开始，到能为自己安排一件小事',
    tone: '温和、给空间，不催促走出来',
  },
  '14day-rumination': {
    focus: '停止反复内耗、识别触发点、建立心理边界、重建对自我的信任',
    tone: '冷静、结构化，帮助用户跳出循环',
  },
};

export function buildRecoveryPlanPrompt(input: RecoveryPlanInput): {
  system: string;
  user: string;
} {
  const theme = PLAN_THEMES[input.plan_type] ?? {
    focus: '自我关怀与情绪恢复',
    tone: '温和',
  };

  const lines = [
    '请为下面这位用户生成"今天这一天"的恢复任务：',
    '',
    `计划类型：${input.plan_type}`,
    `今天是计划的第 ${input.day_index} 天`,
    `主题方向：${theme.focus}`,
    `语气要求：${theme.tone}`,
  ];
  if (input.user_state && input.user_state.trim().length > 0) {
    lines.push(`用户当前状态：${input.user_state.trim()}`);
  }
  lines.push(
    '',
    '只输出 JSON：{ "task": "...", "reflection_prompt": "...", "encouragement": "..." }'
  );

  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}
