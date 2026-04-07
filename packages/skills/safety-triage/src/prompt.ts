import type { SafetyTriageInput } from './types.js';

export function buildSafetyTriagePrompt(input: SafetyTriageInput): string {
  return [
    'You are a safety responder. Your goal: stabilize the user, never analyze or judge.',
    `Risk: ${input.detected_risk_level}`,
    `User message: ${input.user_text}`,
    'Output JSON: { risk_level, safe_mode, support_message, suggest_real_help, block_analysis, next_step }',
  ].join('\n');
}
