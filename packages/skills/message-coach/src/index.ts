/**
 * message-coach skill —— Phase 4 实现
 *
 * 设计要点：
 *  - 非流式：调用 AIClient.complete 拿完整 JSON，再解析为 MessageCoachResult
 *  - 解析失败永远走 SAFE_DEFAULT_COACH，不抛错
 *  - 调用前必须 risk_level < 'high'；否则抛 BlockedByRiskError 作为第二道防线
 *  - 严禁直接暴露给前端：必须由 orchestrator 调度
 */
import type { AIClient } from '@emotion/core-ai';
import type { RiskLevel } from '@emotion/shared';
import { buildMessageCoachPrompt } from './prompt.js';
import { parseMessageCoachOutput, SAFE_DEFAULT_COACH } from './parser.js';
import type { MessageCoachInput, MessageCoachOutput } from './types.js';

export { buildMessageCoachPrompt } from './prompt.js';
export {
  parseMessageCoachOutput,
  extractJson,
  SAFE_DEFAULT_COACH,
} from './parser.js';
export type { MessageCoachInput, MessageCoachOutput } from './types.js';

/**
 * orchestrator 已在 Step 2 强制把 high/critical 路由到 safety；
 * 这里是第二道防线，防止任何调用方在新分支或重构中绕过它。
 */
export class BlockedByRiskError extends Error {
  readonly code = 'MESSAGE_COACH_BLOCKED_BY_RISK';
  readonly risk_level: RiskLevel;
  constructor(risk_level: RiskLevel) {
    super(
      `message-coach blocked: risk_level=${risk_level} (must be < 'high')`
    );
    this.name = 'BlockedByRiskError';
    this.risk_level = risk_level;
  }
}

export interface MessageCoachDeps {
  ai: AIClient;
  /** 当前 effective_risk，用于第二道防线 */
  risk_level: RiskLevel;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 覆盖 max_tokens；三条短话术不需要太多，默认 768 */
  maxTokens?: number;
}

const HIGH_RISK_LEVELS = new Set<RiskLevel>(['high', 'critical']);

export async function runMessageCoach(
  input: MessageCoachInput,
  deps: MessageCoachDeps
): Promise<MessageCoachOutput> {
  if (HIGH_RISK_LEVELS.has(deps.risk_level)) {
    throw new BlockedByRiskError(deps.risk_level);
  }

  const { system, user } = buildMessageCoachPrompt(input);

  let raw: string;
  try {
    raw = await deps.ai.complete({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: deps.maxTokens ?? 768,
      signal: deps.signal,
      timeoutMs: deps.timeoutMs,
    });
  } catch {
    return SAFE_DEFAULT_COACH;
  }

  return parseMessageCoachOutput(raw);
}
