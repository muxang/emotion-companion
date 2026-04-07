import { RISK_LEVEL_ORDER, type RiskLevel } from '@emotion/shared';

/**
 * Phase 2 关键词分类器。
 *
 * 注意：这是 Phase 2 的最小安全兜底，规则刻意保守，宁可漏判一些
 * 边缘表达，也不能误伤常见情感倾诉（例如不把"不要我了"识别为 critical）。
 * 完整 AI 分类版留到 Phase 7。
 *
 * 命中优先级：critical > high > low
 */

const CRITICAL_KEYWORDS = [
  '不想活',
  '想死',
  '自杀',
  '自残',
  '自伤',
  '结束生命',
  '结束自己',
  '活不下去',
  '撑不下去了',
  '想消失了',
];

const HIGH_KEYWORDS = [
  '伤害自己',
  '想消失',
  '崩溃了',
  '失控',
  '撑不住',
  '好绝望',
  '走不出来',
  '没人在乎',
  '活着没意思',
  '动手了',
];

export function classifyByKeywords(text: string): RiskLevel {
  // 顺序很重要：优先匹配更长/更具体的 critical 词
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) return 'critical';
  if (HIGH_KEYWORDS.some((k) => text.includes(k))) return 'high';
  return 'low';
}

export function isAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return RISK_LEVEL_ORDER[level] >= RISK_LEVEL_ORDER[threshold];
}
