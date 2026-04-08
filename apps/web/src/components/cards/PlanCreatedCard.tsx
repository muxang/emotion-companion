export interface PlanCreatedPayload {
  plan_id: string;
  plan_type: string;
  total_days: number;
}

export interface PlanCreatedCardProps {
  payload: PlanCreatedPayload;
}

const PLAN_TITLE: Record<string, string> = {
  '7day-breakup': '7天走出失恋',
  '14day-rumination': '14天停止内耗',
};

export function PlanCreatedCard({
  payload,
}: PlanCreatedCardProps): JSX.Element {
  const title =
    PLAN_TITLE[payload.plan_type] ?? `${payload.total_days}天恢复计划`;

  return (
    <div
      data-testid="plan-created-card"
      className="rounded-2xl border border-primary-200 bg-primary-50 p-4 shadow-sm"
    >
      <div className="mb-1 text-[14px] font-medium text-primary-700">
        ✅ 计划已创建
      </div>
      <div className="text-[15px] font-medium text-neutral-800">{title}</div>
      <p className="mt-1 text-[13px] text-neutral-600">
        今天是第 1 天,加油!
      </p>
    </div>
  );
}
