import type { IntakeResult } from '@emotion/shared';

export interface EmotionIntakeInput {
  user_text: string;
  recent_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type EmotionIntakeOutput = IntakeResult;
