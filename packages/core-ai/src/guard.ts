/**
 * Final Response Guard - Phase 0 占位骨架。
 * Phase 2 起补齐全部 GUARD_CHECKS 的真实校验逻辑。
 * 见 CLAUDE.md §13.2。
 */
import { GUARD_CHECKS, type GuardCheckName } from '@emotion/shared';

export interface GuardCheckResult {
  passed: boolean;
  failed_checks: GuardCheckName[];
}

export interface GuardContext {
  reply: string;
  is_safety_mode: boolean;
  is_critical: boolean;
}

/**
 * 占位实现：默认通过。Phase 2 起逐项实现。
 */
export function runFinalResponseGuard(_ctx: GuardContext): GuardCheckResult {
  return {
    passed: true,
    failed_checks: [],
  };
}

export { GUARD_CHECKS };
