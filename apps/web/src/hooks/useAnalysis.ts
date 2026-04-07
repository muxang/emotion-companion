import { useAnalysisStore } from '../stores/analysisStore.js';
import type { AnalysisResult } from '@emotion/shared';
import type { AnalysisStatus } from '../stores/analysisStore.js';

/**
 * 关系分析 Hook：封装 analysisStore，组件使用细粒度订阅。
 */
export function useAnalysis(): {
  result: AnalysisResult | null;
  status: AnalysisStatus;
  error: string | null;
  analyze: (userText: string) => Promise<void>;
  reset: () => void;
} {
  const result = useAnalysisStore((s) => s.result);
  const status = useAnalysisStore((s) => s.status);
  const error = useAnalysisStore((s) => s.error);
  const analyze = useAnalysisStore((s) => s.analyze);
  const reset = useAnalysisStore((s) => s.reset);

  return { result, status, error, analyze, reset };
}
