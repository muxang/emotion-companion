import { useState } from 'react';

export interface PlanOptionsCardProps {
  onSelect: (planType: string) => void;
  /**
   * 当这条消息已经不是会话最后一条时（用户已经选过计划），
   * 渲染只读状态——不显示按钮，只提示"已选择计划"。
   * hydrateFromDb 在装载历史时根据消息位置写入。
   */
  isLastMessage?: boolean;
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
  isLastMessage = true,
}: PlanOptionsCardProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (type: string, message: string): void => {
    if (selected) return;
    setSelected(type);
    onSelect(message);
  };

  // 历史消息（非最后一条）：用户早就选过了，按钮不再有意义。
  // 只渲染一段静态提示，避免诱导用户重复点击发送。
  if (!isLastMessage) {
    return (
      <div
        data-testid="plan-options-card"
        className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm"
      >
        <div className="text-[14px] text-neutral-500">已选择计划</div>
      </div>
    );
  }

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
