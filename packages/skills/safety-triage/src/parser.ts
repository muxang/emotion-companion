import { z } from 'zod';
import { RiskLevelSchema } from '@emotion/shared';
import type { SafetyTriageOutput } from './types.js';

const Schema = z.object({
  risk_level: RiskLevelSchema,
  safe_mode: z.boolean(),
  support_message: z.string().min(1),
  suggest_real_help: z.boolean(),
  block_analysis: z.boolean(),
  next_step: z
    .enum(['pause', 'grounding', 'external_support', 'continue_safe_chat'])
    .optional(),
});

export function parseSafetyTriageOutput(raw: string): SafetyTriageOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `safety-triage parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return Schema.parse(json);
}
