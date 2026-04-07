/**
 * 模式路由（CLAUDE.md §8 Step 2-4）
 *
 * 纯函数：根据 IntakeResult、关键词兜底风险、最近一轮 assistant 消息的 risk_level，
 * 决定本轮的 ConversationMode。
 *
 * Phase 2 实现：companion / safety / placeholder（analysis|coach|recovery）
 */
import type {
  ConversationMode,
  IntakeResult,
  RiskLevel,
} from '@emotion/shared';
import { isAtLeast } from '@emotion/safety';

const VULNERABLE_EMOTIONS = new Set(['desperate', 'numb']);

export interface RouteDecisionInput {
  intake: IntakeResult;
  /** packages/safety 关键词兜底分级，与 intake.risk_level 取较高者 */
  keyword_risk: RiskLevel;
  /** 最近一条 assistant 消息的 risk_level（脆弱缓冲） */
  last_assistant_risk: RiskLevel | null;
}

export interface RouteDecision {
  mode: ConversationMode;
  /** 实际生效的 risk_level（intake 与关键词取高） */
  effective_risk: RiskLevel;
  /** 此次决策的简短理由（写日志用） */
  reason: string;
}

export function decideMode(input: RouteDecisionInput): RouteDecision {
  const effective_risk = maxRisk(
    input.intake.risk_level,
    input.keyword_risk
  );

  // Step 2: 风险检查（最高优先级）
  if (effective_risk === 'critical') {
    return {
      mode: 'safety',
      effective_risk,
      reason: 'risk_critical_force_safety',
    };
  }
  if (effective_risk === 'high') {
    return {
      mode: 'safety',
      effective_risk,
      reason: 'risk_high_force_safety',
    };
  }

  // Step 3: 脆弱状态缓冲
  if (VULNERABLE_EMOTIONS.has(input.intake.emotion_state)) {
    return {
      mode: 'companion',
      effective_risk,
      reason: 'vulnerable_emotion_buffer',
    };
  }
  if (input.last_assistant_risk === 'medium') {
    return {
      mode: 'companion',
      effective_risk,
      reason: 'last_round_medium_buffer',
    };
  }

  // Step 4: 按 intake.next_mode 路由
  // analysis/coach/recovery 在 Phase 2 走 placeholder（仍然标记为对应 mode，
  // 由 orchestrator skill 注册表选择 placeholder skill）
  return {
    mode: input.intake.next_mode,
    effective_risk,
    reason: `intake_next_mode_${input.intake.next_mode}`,
  };
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return isAtLeast(a, b) ? a : b;
}
