import { z } from 'zod';
import { ConversationModeSchema } from './intake.js';

export const CreateSessionSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  mode: ConversationModeSchema.optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const SessionIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type SessionIdParam = z.infer<typeof SessionIdParamSchema>;
