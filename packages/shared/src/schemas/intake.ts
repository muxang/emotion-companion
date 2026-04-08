import { z } from 'zod';

export const EmotionStateSchema = z.enum([
  'sad',
  'anxious',
  'angry',
  'confused',
  'lonely',
  'numb',
  'desperate',
  'mixed',
]);

export const IssueTypeSchema = z.enum([
  'breakup',
  'ambiguous',
  'cold-violence',
  'lost-contact',
  'recovery',
  'relationship-eval',
  'loneliness',
  'message-coach',
  'general',
]);

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ConversationModeSchema = z.enum([
  'companion',
  'analysis',
  'coach',
  'recovery',
  'safety',
]);

export const UserIntentSchema = z.enum([
  'chat',
  'request_analysis',
  'create_plan',
  'checkin',
  'view_timeline',
  'message_coach',
]);

export const IntakeResultSchema = z.object({
  emotion_state: EmotionStateSchema,
  issue_type: IssueTypeSchema,
  risk_level: RiskLevelSchema,
  next_mode: ConversationModeSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  intent: UserIntentSchema.optional(),
  intent_confidence: z.number().min(0).max(1).optional(),
});

export type IntakeResultParsed = z.infer<typeof IntakeResultSchema>;
