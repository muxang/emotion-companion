import { create } from 'zustand';
import type { AnalysisResult } from '@emotion/shared';
import { requestAnalysis, type RequestAnalysisInput } from '../api/analysis.js';

export type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

interface AnalysisState {
  result: AnalysisResult | null;
  status: AnalysisStatus;
  error: string | null;
  analyze: (input: RequestAnalysisInput) => Promise<void>;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  result: null,
  status: 'idle',
  error: null,

  async analyze(input) {
    set({ status: 'loading', error: null, result: null });
    try {
      const result = await requestAnalysis(input);
      set({ result, status: 'success', error: null });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '分析失败，请稍后再试',
        result: null,
      });
    }
  },

  reset() {
    set({ result: null, status: 'idle', error: null });
  },
}));
