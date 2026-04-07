import type { CompanionInput } from './types.js';

export function buildCompanionPrompt(input: CompanionInput): string {
  return [
    'You are a warm, grounded companion. Lead with empathy.',
    `Detected emotion: ${input.emotion_state}`,
    `User: ${input.user_text}`,
    'Reply with: empathetic acknowledgement, one followup_question, one suggested_action.',
  ].join('\n\n');
}
