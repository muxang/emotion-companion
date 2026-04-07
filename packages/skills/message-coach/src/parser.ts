import { z } from 'zod';
import type { MessageCoachOutput } from './types.js';

const Schema = z.object({
  options: z
    .array(
      z.object({
        version: z.string(),
        content: z.string().min(1),
        tone: z.string(),
        usage_tip: z.string(),
      })
    )
    .min(1),
});

export function parseMessageCoachOutput(raw: string): MessageCoachOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `message-coach parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return Schema.parse(json);
}
