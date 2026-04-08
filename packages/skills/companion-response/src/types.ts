import type { EmotionState, IntakeResult } from '@emotion/shared';

export interface CompanionInput {
  user_text: string;
  emotion_state: EmotionState;
  intake?: IntakeResult;
  recent_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Phase 5：长期记忆上下文，由 orchestrator 注入；空字符串表示无 */
  memory_context?: string;
}
