import { useState } from 'react';
import type { MessageCoachResult } from '@emotion/shared';

export interface CoachResultCardProps {
  payload: MessageCoachResult;
}

const VERSION_LABELS: Record<string, string> = {
  A: 'A 温和',
  B: 'B 直接',
  C: 'C 轻松',
};

export function CoachResultCard({
  payload,
}: CoachResultCardProps): JSX.Element {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (
    content: string,
    idx: number
  ): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* 剪贴板不可用时静默忽略 */
    }
    setCopiedIdx(idx);
    window.setTimeout(() => {
      setCopiedIdx((cur) => (cur === idx ? null : cur));
    }, 2000);
  };

  return (
    <div
      data-testid="coach-result-card"
      className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 text-[14px] font-medium text-primary-700">
        💬 三版话术建议
      </div>
      <div className="space-y-3">
        {payload.options.map((opt, i) => (
          <div
            key={i}
            data-testid={`coach-option-${i}`}
            className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] font-medium text-primary-600">
                {VERSION_LABELS[opt.version] ?? opt.version}
              </span>
              <button
                type="button"
                data-testid={`coach-copy-${i}`}
                onClick={() => void handleCopy(opt.content, i)}
                className="text-[12px] text-primary-600 hover:text-primary-700"
              >
                {copiedIdx === i ? '已复制 ✓' : '复制'}
              </button>
            </div>
            <p className="mb-1 whitespace-pre-wrap text-[14px] leading-[1.7] text-neutral-800">
              {opt.content}
            </p>
            {opt.usage_tip ? (
              <p className="text-[12px] text-neutral-500">
                💡 {opt.usage_tip}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
