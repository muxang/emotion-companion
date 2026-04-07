/**
 * Recovery Plan Skill
 * Phase 0：骨架。Phase 6 实现完整逻辑。
 */
export { buildRecoveryPlanPrompt } from './prompt.js';
export { parseRecoveryPlanOutput } from './parser.js';
export type { RecoveryPlanInput, RecoveryPlanOutput } from './types.js';

import type { RecoveryPlanInput, RecoveryPlanOutput } from './types.js';

export async function runRecoveryPlan(
  _input: RecoveryPlanInput
): Promise<RecoveryPlanOutput> {
  throw new Error('runRecoveryPlan not implemented (Phase 6)');
}
