/**
 * Tong Analysis Skill (wrapper)
 *
 * 注意：禁止直接将此 skill 暴露给前端用户。
 * 调用前必须由 orchestrator 检查 risk_level < 'high'。
 *
 * Phase 0：骨架。Phase 3 接入 tong-jincheng-skill。
 */
export { buildTongAnalysisPrompt } from './prompt.js';
export { parseTongAnalysisOutput } from './parser.js';
export type { TongAnalysisInput, TongAnalysisOutput } from './types.js';

import type { TongAnalysisInput, TongAnalysisOutput } from './types.js';

export async function runTongAnalysis(
  _input: TongAnalysisInput
): Promise<TongAnalysisOutput> {
  throw new Error('runTongAnalysis not implemented (Phase 3)');
}
