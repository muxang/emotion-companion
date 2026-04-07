/**
 * Emotion Intake Skill - Phase 2 实现
 *
 * 非流式：调用 AIClient.complete 拿到 JSON，解析为 IntakeResult。
 * 解析失败永远走 SAFE_DEFAULT_INTAKE，不抛错。
 */
import type { AIClient } from '@emotion/core-ai';
import type { IntakeResult } from '@emotion/shared';
import { buildIntakePrompt } from './prompt.js';
import { parseIntakeOutput, SAFE_DEFAULT_INTAKE } from './parser.js';
import type { EmotionIntakeInput } from './types.js';

export { buildIntakePrompt } from './prompt.js';
export { parseIntakeOutput, SAFE_DEFAULT_INTAKE, extractJson } from './parser.js';
export type { EmotionIntakeInput, EmotionIntakeOutput } from './types.js';

export interface EmotionIntakeDeps {
  ai: AIClient;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 用于覆盖 max_tokens；intake 输出很短，默认 512 足够 */
  maxTokens?: number;
}

export async function runEmotionIntake(
  input: EmotionIntakeInput,
  deps: EmotionIntakeDeps
): Promise<IntakeResult> {
  const { system, user } = buildIntakePrompt(input);
  try {
    const raw = await deps.ai.complete({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: deps.maxTokens ?? 512,
      signal: deps.signal,
      timeoutMs: deps.timeoutMs,
    });
    return parseIntakeOutput(raw);
  } catch {
    // 网络/超时/AI 错误也走安全默认值，让 orchestrator 接续 companion 流程。
    // 真正的危险表达由 packages/safety 关键词兜底拦截。
    return SAFE_DEFAULT_INTAKE;
  }
}
