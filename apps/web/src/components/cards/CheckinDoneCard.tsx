export interface CheckinDonePayload {
  day_index: number;
  mood_score: number;
  encouragement?: string;
}

export interface CheckinDoneCardProps {
  payload: CheckinDonePayload;
}

export function CheckinDoneCard({
  payload,
}: CheckinDoneCardProps): JSX.Element {
  return (
    <div
      data-testid="checkin-done-card"
      className="rounded-2xl border border-primary-200 bg-primary-50 p-4 shadow-sm"
    >
      <div className="mb-1 text-[14px] font-medium text-primary-700">
        ✓ 第 {payload.day_index} 天打卡完成
      </div>
      <div className="text-[13px] text-neutral-700">
        今日心情:{' '}
        <span className="font-medium text-primary-700">
          {payload.mood_score}/10
        </span>
      </div>
      {payload.encouragement ? (
        <p className="mt-2 text-[13px] leading-[1.7] text-neutral-700">
          {payload.encouragement}
        </p>
      ) : null}
    </div>
  );
}
