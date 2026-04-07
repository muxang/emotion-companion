/**
 * Safety Triage Skill
 *
 * 优先级最高。任何 risk_level >= high 时由 orchestrator 强制路由到此 skill。
 * Phase 0：骨架。Phase 2/7 实现完整逻辑。
 */
export { buildSafetyTriagePrompt } from './prompt.js';
export { parseSafetyTriageOutput } from './parser.js';
export type { SafetyTriageInput, SafetyTriageOutput } from './types.js';

import type { SafetyTriageInput, SafetyTriageOutput } from './types.js';

export async function runSafetyTriage(
  _input: SafetyTriageInput
): Promise<SafetyTriageOutput> {
  throw new Error('runSafetyTriage not implemented (Phase 2/7)');
}
