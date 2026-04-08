/**
 * 智能融合层：从对话历史 + 长期记忆自动构造 tong-analysis 输入。
 *
 * 与 analysis-input.ts 的区别：
 *   - analysis-input.ts 仅基于 intake + 当前 user_text 切片
 *   - 本文件结合最近 6 条 user 消息抽事实，并从 userMemory.entities 推断关系阶段
 *
 * 不调用 AI，纯关键词/句法启发式，便于在 request_analysis 意图下快速命中。
 */
import type {
  EmotionState,
  IntakeResult,
  TongAnalysisInput,
  UserMemory,
} from '@emotion/shared';

/** 历史消息接口（与 orchestrator 内部 history 兼容） */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 用户原文里包含这些情绪词的句子会被过滤掉，
 * 只保留客观陈述句作为 facts。
 */
const EMOTION_WORD_LIST: string[] = [
  '难受', '好烦', '想哭', '崩溃', '委屈', '痛苦', '绝望',
  '恨', '爱', '喜欢', '心痛', '心碎', '难过', '伤心',
  '焦虑', '害怕', '恐惧', '气死', '生气', '愤怒',
  '舍不得', '放不下', '不甘心', '空落落', '麻木',
  '我好', '感觉', '觉得自己',
];

/** user_goal 关键词映射表：命中即返回该 goal */
const GOAL_PATTERNS: Array<{ keywords: string[]; goal: string }> = [
  {
    keywords: ['喜不喜欢', '喜欢我吗', '是不是喜欢', '在不在意', '在乎我'],
    goal: '判断对方的情感投入程度',
  },
  {
    keywords: ['该不该', '要不要继续', '值不值得', '继续吗', '分手吗', '该走该留'],
    goal: '判断这段关系是否值得继续',
  },
  {
    keywords: ['为什么', '怎么回事', '什么意思', '到底想'],
    goal: '理解对方行为背后的可能动机',
  },
  {
    keywords: ['是不是在', '是不是已经', '是不是不'],
    goal: '判断当前关系的真实状态',
  },
  {
    keywords: ['暧昧', '吊着我', '玩我'],
    goal: '看清这段暧昧/拉扯关系的真实状态',
  },
];

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

/**
 * 从当前 user_text 中提取 user_goal。
 * 使用关键词映射，不调用 AI；缺省回退到通用 goal。
 */
export function extractUserGoal(currentText: string): string {
  const text = currentText || '';
  for (const pattern of GOAL_PATTERNS) {
    if (pattern.keywords.some((kw) => text.includes(kw))) {
      return pattern.goal;
    }
  }
  return '理清当前关系状态';
}

/**
 * 判断一句话是否是情绪宣泄。
 * 命中情绪词列表的一律视为情绪句，过滤掉。
 */
function isEmotionalSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length === 0) return true;
  return EMOTION_WORD_LIST.some((word) => trimmed.includes(word));
}

/**
 * 从最近 6 条 user 消息中抽客观事实。
 *   - 按句号/换行/分号切句
 *   - 过滤情绪句
 *   - 去重，最多 12 条
 */
export function extractFactsFromHistory(
  messages: HistoryMessage[],
  currentText: string,
  maxItems = 12
): string[] {
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .slice(-6)
    .map((m) => m.content);

  // 当前消息也算入抽取来源
  if (currentText && currentText.trim().length > 0) {
    userMessages.push(currentText);
  }

  const facts: string[] = [];
  const seen = new Set<string>();

  for (const text of userMessages) {
    const sentences = text.split(/[。．！？!?\n;；]+/);
    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length === 0) continue;
      if (s.length < 4) continue; // 太短信息量低
      if (isEmotionalSentence(s)) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      facts.push(s);
      if (facts.length >= maxItems) return facts;
    }
  }

  return facts;
}

/**
 * 从用户长期记忆中读出关系阶段。
 * 取第一个关系对象的 relation_type；缺省返回 '未明确'。
 */
export function inferRelationshipStage(userMemory: UserMemory): string {
  const first = userMemory.entities[0];
  if (first && first.relation_type) {
    return first.relation_type;
  }
  return '未明确';
}

/**
 * 智能融合层主入口：从历史消息 + 记忆 + 当前文本构造分析输入。
 * 必须保证：即使所有数据都为空，也能返回合法的 TongAnalysisInput。
 */
export function buildAnalysisInputFromHistory(
  messages: HistoryMessage[],
  userMemory: UserMemory,
  currentText: string,
  intake: IntakeResult
): TongAnalysisInput {
  const facts = extractFactsFromHistory(messages, currentText);
  const safeFacts =
    facts.length > 0
      ? facts
      : [currentText.trim() || '（用户未补充具体事实）'];

  return {
    user_goal: extractUserGoal(currentText),
    relationship_stage: inferRelationshipStage(userMemory),
    facts: safeFacts,
    user_state: EMOTION_STATE_DESC[intake.emotion_state],
    required_output: ['analysis', 'evidence', 'advice'],
  };
}
