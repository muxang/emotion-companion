/**
 * 从 intake + 用户原文构造 tong-analysis 的结构化输入。
 *
 * 这是 Phase 3 的过渡实现：
 *   - Phase 3 暂未引入独立的"事实抽取 skill"
 *   - 因此 facts 由 user_text 按句号/换行简单切片得到
 *   - user_goal / relationship_stage / user_state 由 intake 字段映射
 *
 * 后续 Phase 5/6 引入记忆与事件抽取后，facts 会改为来自结构化事件流，
 * 而不是直接复用用户原文片段。
 */
import type { EmotionState, IntakeResult, IssueType } from '@emotion/shared';
import type { TongAnalysisInput } from '@emotion/shared';

const ISSUE_GOAL: Record<IssueType, string> = {
  breakup: '看清这段已结束/正在结束的关系',
  ambiguous: '看清这段暧昧关系的真实状态',
  'cold-violence': '看清对方冷暴力背后的可能原因与应对方向',
  'lost-contact': '看清对方失联的可能含义并决定下一步',
  recovery: '理清当前恢复期的进展',
  'relationship-eval': '评估这段关系是否值得继续',
  loneliness: '理清自己当前的孤独感与可行的连接方式',
  'message-coach': '看清当前沟通卡点',
  general: '理清这件事',
};

const ISSUE_STAGE: Record<IssueType, string> = {
  breakup: '分手期',
  ambiguous: '暧昧未确认',
  'cold-violence': '关系中冷暴力阶段',
  'lost-contact': '失联期',
  recovery: '分手后恢复期',
  'relationship-eval': '需要评估去留',
  loneliness: '不限定',
  'message-coach': '不限定',
  general: '不限定',
};

const EMOTION_STATE_DESC: Record<EmotionState, string> = {
  sad: '难过、低落',
  anxious: '焦虑、紧张',
  angry: '愤怒、委屈',
  confused: '困惑、纠结',
  lonely: '孤独',
  numb: '麻木',
  desperate: '强烈情绪压力',
  mixed: '情绪混合',
};

/** 把用户原文按中英文句号/换行/分号切片成"事件式"facts */
export function splitFacts(userText: string, maxItems = 12): string[] {
  return userText
    .split(/[。．！？!?\n;；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

export function buildAnalysisInputFromIntake(
  intake: IntakeResult,
  userText: string
): TongAnalysisInput {
  const facts = splitFacts(userText);
  // 兜底：若切不出任何句子，使用整段原文作为单一事实
  const safeFacts = facts.length > 0 ? facts : [userText.trim() || '（用户未补充具体事实）'];

  return {
    user_goal: ISSUE_GOAL[intake.issue_type],
    relationship_stage: ISSUE_STAGE[intake.issue_type],
    facts: safeFacts,
    user_state: EMOTION_STATE_DESC[intake.emotion_state],
    required_output: ['analysis', 'evidence', 'risks', 'advice'],
  };
}

/** 把结构化分析结果拼接为流式回放文本 */
export function formatAnalysisText(analysis: string, advice: string): string {
  return `${analysis.trim()}\n\n建议：${advice.trim()}`;
}
