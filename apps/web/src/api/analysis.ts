import type { AnalysisResult } from '@emotion/shared';
import { fetchJson } from './client.js';

export interface RequestAnalysisInput {
  session_id: string;
  user_goal: string;
  relationship_stage: string;
  facts: string[];
  user_state: string;
}

/**
 * 调用关系分析接口（Phase 3）。
 * 后端契约见 CLAUDE.md §12.1。
 */
export async function requestAnalysis(
  input: RequestAnalysisInput
): Promise<AnalysisResult> {
  return fetchJson<AnalysisResult>('/api/analysis/relationship', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
