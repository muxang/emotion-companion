import type { TongAnalysisInput } from './types.js';

/**
 * Wrapper prompt for tong-jincheng-skill.
 * 严禁直接传入用户原文；只传 facts 列表与结构化字段。
 */
export function buildTongAnalysisPrompt(input: TongAnalysisInput): string {
  return [
    'Structured relationship analysis. Use only the facts provided.',
    `User goal: ${input.user_goal}`,
    `Relationship stage: ${input.relationship_stage}`,
    `User state: ${input.user_state}`,
    'Facts:',
    ...input.facts.map((f, i) => `  ${i + 1}. ${f}`),
    `Required outputs: ${input.required_output.join(', ')}`,
    'Output JSON only matching: { analysis, evidence, risks, advice, confidence, tone }',
  ].join('\n');
}
