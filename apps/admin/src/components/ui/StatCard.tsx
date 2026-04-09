interface StatCardProps {
  label: string;
  value: string | number;
  change?: string; // 如 "+12%" 或 "-3%"
  changeType?: 'positive' | 'negative' | 'neutral';
}

export default function StatCard({
  label,
  value,
  change,
  changeType = 'neutral',
}: StatCardProps) {
  const changeColor =
    changeType === 'positive'
      ? 'text-primary-500'
      : changeType === 'negative'
        ? 'text-red-400'
        : 'text-neutral-400';

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-[13px] text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-neutral-800">{value}</p>
      {change && (
        <p className={`mt-1 text-[12px] ${changeColor}`}>{change}</p>
      )}
    </div>
  );
}
