/**
 * recovery-plan skill —— Phase 6 实现
 *
 * 设计要点：
 *  - 非流式：调用 AIClient.complete 拿完整 JSON，再解析为 RecoveryTask
 *  - 解析失败永远走 makeSafeDefaultTask，不抛错
 *  - 调用前必须 risk_level !== 'critical'；critical 抛 BlockedByRiskError
 *  - 严禁直接暴露给前端：必须由 orchestrator 或 routes 层调度
 */
import type { RiskLevel } from '@emotion/shared';
import { buildRecoveryPlanPrompt } from './prompt.js';
import { parseRecoveryPlanOutput, makeSafeDefaultTask } from './parser.js';
import type {
  RecoveryPlanDeps,
  RecoveryPlanInput,
  RecoveryPlanOutput,
} from './types.js';

export { buildRecoveryPlanPrompt } from './prompt.js';
export {
  parseRecoveryPlanOutput,
  extractJson,
  makeSafeDefaultTask,
} from './parser.js';
export type {
  RecoveryPlanInput,
  RecoveryPlanOutput,
  RecoveryPlanDeps,
} from './types.js';

/**
 * orchestrator 已在 Step 2 强制把 critical 路由到 safety；
 * 这里是第二道防线，防止任何调用方在新分支或重构中绕过它。
 *
 * 注意：与 tong-analysis / message-coach 不同，recovery 模式允许 high
 * 之外的所有等级（recovery-plan 是温和的自我照顾任务，high 风险时
 * orchestrator 会路由到 safety，但 recovery 计划详情接口本身仍可访问）。
 * 因此这里只对 critical 抛错。
 */
export class BlockedByRiskError extends Error {
  readonly code = 'RECOVERY_PLAN_BLOCKED_BY_RISK';
  readonly risk_level: RiskLevel;
  constructor(risk_level: RiskLevel) {
    super(
      `recovery-plan blocked: risk_level=${risk_level} (must not be 'critical')`
    );
    this.name = 'BlockedByRiskError';
    this.risk_level = risk_level;
  }
}

export async function runRecoveryPlan(
  input: RecoveryPlanInput,
  deps: RecoveryPlanDeps
): Promise<RecoveryPlanOutput> {
  if (deps.risk_level === 'critical') {
    throw new BlockedByRiskError(deps.risk_level);
  }

  const { system, user } = buildRecoveryPlanPrompt(input);

  let raw: string;
  try {
    raw = await deps.ai.complete({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: deps.maxTokens ?? 512,
      signal: deps.signal,
      timeoutMs: deps.timeoutMs,
    });
  } catch {
    return makeSafeDefaultTask(input.day_index);
  }

  return parseRecoveryPlanOutput(raw, input.day_index);
}
