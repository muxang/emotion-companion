import { z } from 'zod';
import type { TongAnalysisOutput } from './types.js';

const TongAnalysisOutputSchema = z.object({
  analysis: z.string().min(1),
  evidence: z.array(z.string()),
  risks: z.array(z.string()),
  advice: z.string().min(1),
  confidence: z.number().min(0).max(1),
  tone: z.enum(['gentle', 'neutral', 'direct']),
});

export function parseTongAnalysisOutput(raw: string): TongAnalysisOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `tong-analysis parser: invalid JSON: ${(err as Error).message}`
    );
  }
  return TongAnalysisOutputSchema.parse(json);
}
