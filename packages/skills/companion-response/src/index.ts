/**
 * Companion Response Skill
 * Phase 0：骨架。Phase 4 实现完整逻辑。
 */
export { buildCompanionPrompt } from './prompt.js';
export { parseCompanionOutput } from './parser.js';
export type { CompanionInput, CompanionOutput } from './types.js';

import type { CompanionInput, CompanionOutput } from './types.js';

export async function runCompanionResponse(
  _input: CompanionInput
): Promise<CompanionOutput> {
  throw new Error('runCompanionResponse not implemented (Phase 4)');
}
