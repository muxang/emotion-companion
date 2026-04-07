import type { AnalysisResult } from '@emotion/shared';
import { fetchJson } from './client.js';

export interface RequestAnalysisInput {
  user_text: string;
}

/**
 * 调用关系分析接口（Phase 3）。
 * 后端契约见 CLAUDE.md §12.1。
 *
 * 前端只传一段自然语言，结构化抽取由后端 services/extractAnalysisInput 完成。
 */
export async function requestAnalysis(
  input: RequestAnalysisInput
): Promise<AnalysisResult> {
  const data = await fetchJson<{ analysis: AnalysisResult }>(
    '/api/analysis/relationship',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return data.analysis;
}
