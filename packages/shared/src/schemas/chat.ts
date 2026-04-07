import { z } from 'zod';

export const ChatMessageSchema = z.object({
  session_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
  context: z
    .object({
      recent_messages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          })
        )
        .max(10)
        .optional(),
    })
    .optional(),
});

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;
