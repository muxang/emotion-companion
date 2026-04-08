import type { AnalysisResult, MessageCoachResult } from '@emotion/shared';
import type { ActionCard } from '../../stores/chatStore.js';
import { AnalysisResultCard } from './AnalysisResultCard.js';
import {
  PlanCreatedCard,
  type PlanCreatedPayload,
} from './PlanCreatedCard.js';
import { PlanOptionsCard } from './PlanOptionsCard.js';
import {
  CheckinDoneCard,
  type CheckinDonePayload,
} from './CheckinDoneCard.js';
import { CoachResultCard } from './CoachResultCard.js';

export interface ActionCardRendererProps {
  card: ActionCard;
  /** plan_options 卡片点击后回调，向对话发送一条消息 */
  onPlanOptionSelect?: (message: string) => void;
}

export function ActionCardRenderer({
  card,
  onPlanOptionSelect,
}: ActionCardRendererProps): JSX.Element | null {
  switch (card.action_type) {
    case 'analysis_result':
      return (
        <AnalysisResultCard payload={card.payload as AnalysisResult} />
      );
    case 'plan_created':
      return (
        <PlanCreatedCard payload={card.payload as PlanCreatedPayload} />
      );
    case 'plan_options':
      return (
        <PlanOptionsCard
          onSelect={(message) => onPlanOptionSelect?.(message)}
          isLastMessage={card.isLastMessage}
        />
      );
    case 'checkin_done':
      return (
        <CheckinDoneCard payload={card.payload as CheckinDonePayload} />
      );
    case 'coach_result':
      return (
        <CoachResultCard payload={card.payload as MessageCoachResult} />
      );
    default:
      return null;
  }
}
