/**
 * Message Coach Skill
 * Phase 0：骨架。Phase 4 实现完整逻辑。
 */
export { buildMessageCoachPrompt } from './prompt.js';
export { parseMessageCoachOutput } from './parser.js';
export type { MessageCoachInput, MessageCoachOutput } from './types.js';

import type { MessageCoachInput, MessageCoachOutput } from './types.js';

export async function runMessageCoach(
  _input: MessageCoachInput
): Promise<MessageCoachOutput> {
  throw new Error('runMessageCoach not implemented (Phase 4)');
}
