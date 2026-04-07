import type { EmotionIntakeInput } from './types.js';

/**
 * Emotion intake skill 的 prompt 模板（Phase 0 占位实现，Phase 2 完整实现）。
 */
export function buildIntakePrompt(input: EmotionIntakeInput): string {
  const history = (input.recent_history ?? [])
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  return [
    'You are an emotion intake classifier. Analyze the user message and output JSON only.',
    history ? `Recent history:\n${history}` : '',
    `User message:\n${input.user_text}`,
    'Output schema: { emotion_state, issue_type, risk_level, next_mode, confidence, reasoning }',
  ]
    .filter(Boolean)
    .join('\n\n');
}
