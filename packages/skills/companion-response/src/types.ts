import type { EmotionState, IntakeResult } from '@emotion/shared';

export type CompanionTone = 'warm' | 'rational' | 'direct';

export interface CompanionInput {
  user_text: string;
  emotion_state: EmotionState;
  intake?: IntakeResult;
  recent_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 用户在 settings 里显式设置的语气偏好；优先级最高 */
  tone_preference?: CompanionTone;
}
