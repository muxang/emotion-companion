/**
 * Safety guard hooks - Phase 0 占位骨架。
 * Phase 2/7 实现完整 final response guard 集成。
 */
import type { RiskLevel } from '@emotion/shared';

export interface SafetyGuardResult {
  allowed: boolean;
  reason?: string;
}

export function guardOutgoingMessage(
  _text: string,
  _risk: RiskLevel
): SafetyGuardResult {
  return { allowed: true };
}
