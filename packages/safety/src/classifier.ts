import { RISK_LEVEL_ORDER, type RiskLevel } from '@emotion/shared';

/**
 * Phase 0：仅保留极简关键词触发，作为兜底。
 * Phase 2 起接入 emotion-intake skill 给出的真实风险等级。
 */
const CRITICAL_KEYWORDS = ['不想活', '自杀', '结束自己', '撑不下去了'];
const HIGH_KEYWORDS = ['想消失', '伤害自己', '崩溃', '失控'];

export function classifyByKeywords(text: string): RiskLevel {
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) return 'critical';
  if (HIGH_KEYWORDS.some((k) => text.includes(k))) return 'high';
  return 'low';
}

export function isAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return RISK_LEVEL_ORDER[level] >= RISK_LEVEL_ORDER[threshold];
}
