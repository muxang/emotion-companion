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

/** PATCH /api/sessions/:id 请求体；目前只允许改 title */
export const UpdateSessionSchema = z.object({
  title: z.string().trim().min(1).max(60),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
