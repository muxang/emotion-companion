import { z } from 'zod';
import type { CompanionOutput } from './types.js';

const CompanionSchema = z.object({
  reply: z.string().min(1),
  followup_question: z.string().optional(),
  suggested_action: z.string().optional(),
  tone: z.enum(['warm', 'rational', 'direct']),
});

export function parseCompanionOutput(raw: string): CompanionOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `companion-response parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return CompanionSchema.parse(json);
}
