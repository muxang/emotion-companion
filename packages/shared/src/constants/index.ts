/** 风险等级数值排序，用于比较 */
export const RISK_LEVEL_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const;

/** Final Response Guard 检查项常量（CLAUDE.md §13.2） */
export const GUARD_CHECKS = [
  'no_absolute_promise',
  'no_dependency_suggestion',
  'no_verdict_as_analysis',
  'has_actionable_suggestion',
  'no_excessive_bonding',
  'critical_has_real_help',
  'no_dangerous_content',
] as const;

export type GuardCheckName = (typeof GUARD_CHECKS)[number];
