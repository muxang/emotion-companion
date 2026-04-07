/**
 * Companion Response Skill - Phase 2
 *
 * 流式：直接对接 core-ai/AIClient.streamText。
 * 输出 AsyncIterable<string>，由 orchestrator 收集后过 guard 再回放给客户端。
 */
import type { AIClient } from '@emotion/core-ai';
import { buildCompanionPrompt } from './prompt.js';
import type { CompanionInput } from './types.js';

export { buildCompanionPrompt } from './prompt.js';
export { finalizeCompanionText, COMPANION_EMPTY_FALLBACK } from './parser.js';
export type { CompanionInput } from './types.js';

export interface CompanionDeps {
  ai: AIClient;
  signal?: AbortSignal;
  maxTokens?: number;
}

export function runCompanionResponse(
  input: CompanionInput,
  deps: CompanionDeps
): AsyncIterable<string> {
  const { system, messages } = buildCompanionPrompt(input);
  return deps.ai.streamText({
    system,
    messages,
    maxTokens: deps.maxTokens,
    signal: deps.signal,
  });
}
