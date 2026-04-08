import type { AnalysisResult } from '@emotion/shared';

export interface AnalysisResultCardProps {
  payload: AnalysisResult;
}

export function AnalysisResultCard({
  payload,
}: AnalysisResultCardProps): JSX.Element {
  const confidencePct = Math.round((payload.confidence ?? 0) * 100);
  return (
    <div
      data-testid="analysis-result-card"
      className="rounded-2xl border border-l-4 border-primary-200 border-l-primary-400 bg-white p-4 shadow-sm"
    >
      <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[12px] text-primary-600">
        🔍 关系分析结果
      </div>

      <p className="mb-3 text-[14px] leading-[1.8] text-neutral-800">
        {payload.analysis}
      </p>

      {payload.evidence.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 text-[12px] font-medium text-neutral-500">
            观察依据
          </div>
          <ul className="space-y-1">
            {payload.evidence.map((e, i) => (
              <li
                key={i}
                className="text-[13px] leading-[1.7] text-neutral-700"
              >
                · {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {payload.risks.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="mb-1 text-[12px] font-medium text-amber-700">
            风险提示
          </div>
          <ul className="space-y-1">
            {payload.risks.map((r, i) => (
              <li key={i} className="text-[13px] leading-[1.7] text-amber-800">
                · {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {payload.advice ? (
        <div className="mb-3 rounded-lg bg-primary-50 px-3 py-2">
          <div className="mb-1 text-[12px] font-medium text-primary-700">
            建议
          </div>
          <p className="text-[13px] leading-[1.7] text-primary-800">
            {payload.advice}
          </p>
        </div>
      ) : null}

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span>置信度</span>
          <span>{confidencePct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            data-testid="analysis-confidence-bar"
            className="h-full bg-primary-400"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
