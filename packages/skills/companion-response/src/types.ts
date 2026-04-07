import type { EmotionState, IntakeResult } from '@emotion/shared';

export interface CompanionInput {
  user_text: string;
  emotion_state: EmotionState;
  intake?: IntakeResult;
  recent_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
