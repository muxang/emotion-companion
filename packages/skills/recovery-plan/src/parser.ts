import { z } from 'zod';
import type { RecoveryPlanOutput } from './types.js';

const Schema = z.object({
  tasks: z
    .array(
      z.object({
        day_index: z.number().int().min(1),
        task: z.string().min(1),
        reflection_prompt: z.string(),
        encouragement: z.string(),
      })
    )
    .min(1),
});

export function parseRecoveryPlanOutput(raw: string): RecoveryPlanOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `recovery-plan parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return Schema.parse(json);
}
