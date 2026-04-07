import type { MessageCoachInput } from './types.js';

export function buildMessageCoachPrompt(input: MessageCoachInput): string {
  return [
    'You are a message coach. Produce 3 message versions in different tones.',
    `Scenario: ${input.scenario}`,
    `Goal: ${input.user_goal}`,
    input.draft ? `Draft: ${input.draft}` : '',
    'Output: { options: [{ version, content, tone, usage_tip }] }',
  ]
    .filter(Boolean)
    .join('\n');
}
