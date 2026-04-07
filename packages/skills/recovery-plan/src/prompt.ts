import type { RecoveryPlanInput } from './types.js';

export function buildRecoveryPlanPrompt(input: RecoveryPlanInput): string {
  return [
    `Generate a ${input.total_days}-day recovery plan.`,
    `Scenario: ${input.scenario}`,
    `User state: ${input.user_state}`,
    'Output: { tasks: [{ day_index, task, reflection_prompt, encouragement }] }',
  ].join('\n');
}
