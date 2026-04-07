import type { MessageCoachResult } from '@emotion/shared';

export interface MessageCoachInput {
  scenario: string;
  user_goal: string;
  draft?: string;
}

export type MessageCoachOutput = MessageCoachResult;
