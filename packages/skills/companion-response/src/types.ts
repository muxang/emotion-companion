import type { CompanionResponse, EmotionState } from '@emotion/shared';

export interface CompanionInput {
  user_text: string;
  emotion_state: EmotionState;
  recent_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type CompanionOutput = CompanionResponse;
