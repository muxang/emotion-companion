import { z } from 'zod';

/**
 * Phase 6: Recovery plan input schemas.
 */

export const RecoveryPlanTypeSchema = z.enum([
  '7day-breakup',
  '14day-rumination',
]);
export type RecoveryPlanTypeInput = z.infer<typeof RecoveryPlanTypeSchema>;

export const CreateRecoveryPlanSchema = z.object({
  plan_type: RecoveryPlanTypeSchema,
});
export type CreateRecoveryPlanInput = z.infer<typeof CreateRecoveryPlanSchema>;

export const RecoveryPlanIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const RecoveryCheckinSchema = z.object({
  reflection: z.string().max(1000).optional(),
  mood_score: z.number().int().min(1).max(10).optional(),
});
export type RecoveryCheckinInput = z.infer<typeof RecoveryCheckinSchema>;
