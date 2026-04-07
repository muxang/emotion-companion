import type { RecoveryPlanType, RecoveryTask, RiskLevel } from '@emotion/shared';
import type { AIClient } from '@emotion/core-ai';

/**
 * Phase 6: 单日恢复任务的输入。
 *
 * 一次只生成"今天这一天"的任务，便于按需调用。
 */
export interface RecoveryPlanInput {
  plan_type: RecoveryPlanType;
  day_index: number;
  /** 用户当前简短状态描述（可空） */
  user_state?: string;
}

export type RecoveryPlanOutput = RecoveryTask;

export interface RecoveryPlanDeps {
  ai: AIClient;
  /** 当前 effective_risk，用于第二道防线（critical 抛错） */
  risk_level: RiskLevel;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 默认 512 */
  maxTokens?: number;
}
