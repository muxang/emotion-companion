import type { RecoveryTask } from '@emotion/shared';

export interface RecoveryPlanInput {
  scenario: 'breakup' | 'lost-contact' | 'cold-violence' | 'general';
  total_days: 7 | 14;
  user_state: string;
}

export interface RecoveryPlanOutput {
  tasks: RecoveryTask[];
}
