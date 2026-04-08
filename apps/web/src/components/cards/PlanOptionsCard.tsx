import { useState } from 'react';

export interface PlanOptionsCardProps {
  onSelect: (planType: string) => void;
}

const OPTIONS: Array<{
  type: string;
  title: string;
  message: string;
}> = [
  {
    type: '7day-breakup',
    title: '7天走出失恋',
    message: '我想开始7天失恋恢复计划',
  },
  {
    type: '14day-rumination',
    title: '14天停止内耗',
    message: '我想开始14天内耗恢复计划',
  },
];

export function PlanOptionsCard({
  onSelect,
}: PlanOptionsCardProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (type: string, message: string): void => {
    if (selected) return;
    setSelected(type);
    onSelect(message);
  };

  return (
    <div
      data-testid="plan-options-card"
      className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm"
    >
      <div className="mb-3 text-[14px] font-medium text-neutral-700">
        选择你的计划
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.type;
          const isDisabled = selected !== null && !isSelected;
          return (
            <button
              key={opt.type}
              type="button"
              data-testid={`plan-option-${opt.type}`}
              disabled={selected !== null}
              onClick={() => handleClick(opt.type, opt.message)}
              className={[
                'rounded-xl border px-4 py-3 text-left text-[14px] transition',
                isSelected
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : isDisabled
                  ? 'cursor-not-allowed border-neutral-200 bg-white text-neutral-400'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300 hover:bg-primary-50',
              ].join(' ')}
            >
              {isSelected ? '✓ ' : ''}
              {opt.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
