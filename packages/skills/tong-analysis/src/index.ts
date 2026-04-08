/**
 * tong-analysis wrapper —— Phase 3 实现
 *
 * 设计要点：
 *  - 非流式：调用 AIClient.complete 拿完整 JSON，再解析为 AnalysisResult
 *  - 解析失败永远走 SAFE_DEFAULT_ANALYSIS，不抛错
 *  - 调用前必须 risk_level < 'high'；否则抛 BlockedByRiskError 作为第二道防线
 *  - 严禁直接暴露给前端：必须由 orchestrator 调度
 */
import type { AIClient } from '@emotion/core-ai';
import type {
  AnalysisResult,
  RiskLevel,
  TongAnalysisInput,
} from '@emotion/shared';
import { TongAnalysisInputSchema } from '@emotion/shared';
import { buildTongAnalysisPrompt } from './prompt.js';
import { parseTongAnalysisOutput, SAFE_DEFAULT_ANALYSIS } from './parser.js';

export { buildTongAnalysisPrompt } from './prompt.js';
export {
  parseTongAnalysisOutput,
  extractJson,
  SAFE_DEFAULT_ANALYSIS,
} from './parser.js';
export type { TongAnalysisInput, TongAnalysisOutput } from './types.js';

/**
 * orchestrator 已在 Step 2 强制把 high/critical 路由到 safety；
 * 这里是第二道防线，防止任何调用方在新分支或重构中绕过它。
 */
export class BlockedByRiskError extends Error {
  readonly code = 'TONG_ANALYSIS_BLOCKED_BY_RISK';
  readonly risk_level: RiskLevel;
  constructor(risk_level: RiskLevel) {
    super(
      `tong-analysis blocked: risk_level=${risk_level} (must be < 'high')`
    );
    this.name = 'BlockedByRiskError';
    this.risk_level = risk_level;
  }
}

export interface TongAnalysisDeps {
  ai: AIClient;
  /** 当前 effective_risk，用于第二道防线 */
  risk_level: RiskLevel;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 覆盖 max_tokens，分析需要中等长度，默认 1024 */
  maxTokens?: number;
  /** 可选 logger，用于记录降级原因（AI 超时 vs JSON 解析失败） */
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

const HIGH_RISK_LEVELS = new Set<RiskLevel>(['high', 'critical']);

export async function runTongAnalysis(
  input: TongAnalysisInput,
  deps: TongAnalysisDeps
): Promise<AnalysisResult> {
  // 第二道防线：risk_level >= high 直接抛错，绝不调用 AI
  if (HIGH_RISK_LEVELS.has(deps.risk_level)) {
    throw new BlockedByRiskError(deps.risk_level);
  }

  // 输入校验：拒绝非结构化、空 facts、未知 required_output
  // 校验失败视为 orchestrator bug，但仍走安全降级而非抛错
  const parsedInput = TongAnalysisInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return SAFE_DEFAULT_ANALYSIS;
  }

  const { system, user } = buildTongAnalysisPrompt(parsedInput.data);

  let raw: string;
  try {
    raw = await deps.ai.complete({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: deps.maxTokens ?? 2048,
      signal: deps.signal,
      timeoutMs: deps.timeoutMs,
    });
  } catch (err) {
    // 网络/超时/AI 错误一律降级，让 orchestrator 用安全文本继续
    deps.logger?.warn(
      { err: err instanceof Error ? err.message : String(err), timeoutMs: deps.timeoutMs },
      '[tong-analysis] AI call failed, degrading to SAFE_DEFAULT'
    );
    return SAFE_DEFAULT_ANALYSIS;
  }

  const result = parseTongAnalysisOutput(raw);
  if (result === SAFE_DEFAULT_ANALYSIS) {
    deps.logger?.warn(
      { rawLength: raw.length, rawPreview: raw.slice(0, 200) },
      '[tong-analysis] JSON parse failed, degrading to SAFE_DEFAULT'
    );
  }
  return result;
}
