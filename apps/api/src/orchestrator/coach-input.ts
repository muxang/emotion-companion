/**
 * 从 intake + 用户原文构造 message-coach 的结构化输入。
 *
 * Phase 4 过渡实现：
 *   - 暂未引入独立的"意图抽取 skill"
 *   - scenario           : 直接复用 user_text 截断
 *   - user_goal          : 由 issue_type 映射出"用户大概想达到的表达目的"
 *   - relationship_stage : 由 issue_type 映射
 *
 * 后续 Phase 5 引入记忆/事件抽取后，scenario 会改为来自结构化事件流，
 * user_goal 会优先走显式表达（用户自己写）。
 */
import type { IntakeResult, IssueType, MessageCoachResult } from '@emotion/shared';
import type { MessageCoachInput } from '@emotion/skill-message-coach';

const ISSUE_GOAL: Record<IssueType, string> = {
  breakup: '在分手期与对方沟通时表达自己的想法',
  ambiguous: '在暧昧未确认阶段表达自己的真实态度',
  'cold-violence': '在对方冷暴力时主动打破僵局或确认状态',
  'lost-contact': '在失联后尝试重新建立沟通',
  recovery: '在恢复期与相关对象沟通',
  'relationship-eval': '把自己对这段关系的判断表达出来',
  loneliness: '主动向对方发起一次连接',
  'message-coach': '把当前想说的话表达得更得体',
  general: '把当前想表达的内容说出来',
};

const ISSUE_STAGE: Record<IssueType, string> = {
  breakup: '分手期',
  ambiguous: '暧昧未确认',
  'cold-violence': '冷暴力期',
  'lost-contact': '失联期',
  recovery: '分手后恢复期',
  'relationship-eval': '评估去留',
  loneliness: '不限定',
  'message-coach': '不限定',
  general: '不限定',
};

const SCENARIO_MAX = 240;

export function buildCoachInputFromIntake(
  intake: IntakeResult,
  userText: string
): MessageCoachInput {
  const trimmed = userText.trim();
  const scenario =
    trimmed.length > SCENARIO_MAX
      ? trimmed.slice(0, SCENARIO_MAX) + '…'
      : trimmed || '（用户未补充具体背景）';

  return {
    scenario,
    user_goal: ISSUE_GOAL[intake.issue_type],
    relationship_stage: ISSUE_STAGE[intake.issue_type],
  };
}

const VERSION_LABEL: Record<'A' | 'B' | 'C', string> = {
  A: '版本A（温和）',
  B: '版本B（直接）',
  C: '版本C（轻松）',
};

/**
 * 把 MessageCoachResult 拼接为流式回放文本。
 * 严格按照 CLAUDE.md / 任务要求的格式：
 *
 *   **版本A（温和）**\n{content}\n💡 {usage_tip}\n\n
 *   **版本B（直接）**\n{content}\n💡 {usage_tip}\n\n
 *   **版本C（轻松）**\n{content}\n💡 {usage_tip}
 *
 * 调用前 parser 已强制按 A→B→C 排序。
 */
export function formatCoachText(result: MessageCoachResult): string {
  const blocks = result.options.map((opt) => {
    const label =
      VERSION_LABEL[opt.version as 'A' | 'B' | 'C'] ?? `版本${opt.version}`;
    return `**${label}**\n${opt.content.trim()}\n💡 ${opt.usage_tip.trim()}`;
  });
  return blocks.join('\n\n');
}
