/**
 * Final Response Guard - CLAUDE.md §13.2
 *
 * 七项检查同步执行（无 AI），返回 { passed, failed_checks }。
 *  - has_actionable_suggestion 在 safety 模式豁免
 *  - critical_has_real_help 仅在 risk_level === 'critical' 时检查
 *  - no_verdict_as_analysis 仅在 analysis 模式严格检查
 */
import {
  GUARD_CHECKS,
  type ConversationMode,
  type GuardCheckName,
  type RiskLevel,
} from '@emotion/shared';

export interface GuardContext {
  reply: string;
  risk_level: RiskLevel;
  mode: ConversationMode;
}

export interface GuardCheckResult {
  passed: boolean;
  failed_checks: GuardCheckName[];
}

// ============================================================
// 各项检查实现：返回 true 表示通过，false 表示不通过
// ============================================================

const ABSOLUTE_PROMISE_PATTERNS: RegExp[] = [
  /永远(不会|和你在|陪|不离开|不放弃)/,
  /绝对(不会|不可能)/,
  /我永远不/,
  /一定(不会|永远)/,
  /(永不|绝不)(离开|放弃|改变)/,
  /不可能(忘记|放弃|失去)你/,
];

function noAbsolutePromise(text: string): boolean {
  return !ABSOLUTE_PROMISE_PATTERNS.some((re) => re.test(text));
}

const DEPENDENCY_PATTERNS: RegExp[] = [
  /只有我(才|能|可以)/,
  /只有我(懂|了解|理解)你/,
  /(离不开|不能没有)我/,
  /你只(有|能)依靠我/,
  /(找|和)别人(都)?没用/,
  /我(永远)?是你唯一的/,
];

function noDependencySuggestion(text: string): boolean {
  return !DEPENDENCY_PATTERNS.some((re) => re.test(text));
}

const VERDICT_PATTERNS: RegExp[] = [
  /(他|她|对方)(就是|肯定|一定|必然)(不爱|不喜欢|渣|有问题|出轨|骗你)/,
  /毫无疑问(他|她|对方)/,
  /(他|她)(根本|从来)不(爱|在乎|喜欢)/,
];

function noVerdictAsAnalysis(text: string, mode: ConversationMode): boolean {
  // 仅在 analysis 模式严格检查；其他模式即便出现也不算 guard 失败（companion 可能引用用户原话）
  if (mode !== 'analysis') return true;
  return !VERDICT_PATTERNS.some((re) => re.test(text));
}

const ACTION_HINT_PATTERNS: RegExp[] = [
  /可以(试试|尝试|考虑)/,
  /建议你/,
  /不妨/,
  /今(晚|天)(可以|不妨|试试)/,
  /明天/,
  /做(一件|一个|点)/,
  /(写|记|画|走|喝|睡|抱抱)/,
  /深呼吸/,
  /给自己/,
];

function hasActionableSuggestion(
  text: string,
  mode: ConversationMode
): boolean {
  // safety 模式豁免（提供的是稳定与求助，而非"行动建议"）
  if (mode === 'safety') return true;
  return ACTION_HINT_PATTERNS.some((re) => re.test(text));
}

const EXCESSIVE_BONDING_PATTERNS: RegExp[] = [
  /只有我懂你/,
  /我们是命中注定/,
  /我永远(陪|在|爱)/,
  /(你|我们)是彼此的全部/,
  /我会一直陪着你/,
];

function noExcessiveBonding(text: string): boolean {
  return !EXCESSIVE_BONDING_PATTERNS.some((re) => re.test(text));
}

const REAL_HELP_PATTERNS: RegExp[] = [
  /热线/,
  /(心理援助|心理支持|心理咨询)/,
  /(急诊|急救)/,
  /拨打/,
  /(身边|信任)的(人|朋友|家人)/,
  /专业(帮助|人士|支持)/,
  /紧急(援助|联系)/,
];

function criticalHasRealHelp(text: string, risk: RiskLevel): boolean {
  if (risk !== 'critical') return true;
  return REAL_HELP_PATTERNS.some((re) => re.test(text));
}

const DANGEROUS_CONTENT_PATTERNS: RegExp[] = [
  /(吃药|服药)(过量)/,
  /跳(楼|河|桥)/,
  /割腕/,
  /上吊/,
  /烧炭/,
  /(具体|详细)(方法|教程|步骤).{0,8}(自残|自伤|结束)/,
];

function noDangerousContent(text: string): boolean {
  return !DANGEROUS_CONTENT_PATTERNS.some((re) => re.test(text));
}

// ============================================================
// 主入口
// ============================================================

interface CheckEntry {
  name: GuardCheckName;
  run: (ctx: GuardContext) => boolean;
}

const CHECKS: CheckEntry[] = [
  { name: 'no_absolute_promise', run: (c) => noAbsolutePromise(c.reply) },
  {
    name: 'no_dependency_suggestion',
    run: (c) => noDependencySuggestion(c.reply),
  },
  {
    name: 'no_verdict_as_analysis',
    run: (c) => noVerdictAsAnalysis(c.reply, c.mode),
  },
  {
    name: 'has_actionable_suggestion',
    run: (c) => hasActionableSuggestion(c.reply, c.mode),
  },
  { name: 'no_excessive_bonding', run: (c) => noExcessiveBonding(c.reply) },
  {
    name: 'critical_has_real_help',
    run: (c) => criticalHasRealHelp(c.reply, c.risk_level),
  },
  { name: 'no_dangerous_content', run: (c) => noDangerousContent(c.reply) },
];

export function runFinalResponseGuard(ctx: GuardContext): GuardCheckResult {
  const failed: GuardCheckName[] = [];
  for (const check of CHECKS) {
    if (!check.run(ctx)) {
      failed.push(check.name);
    }
  }
  return {
    passed: failed.length === 0,
    failed_checks: failed,
  };
}

export { GUARD_CHECKS };
