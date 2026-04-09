import { useEffect, useState } from 'react';
import { fetchRecoveryStats, type RecoveryStats } from '../../api/recovery';
import StatCard from '../../components/ui/StatCard';

export default function RecoveryPage() {
  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRecoveryStats()
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="py-20 text-center text-red-400">{error}</p>;
  if (!stats)
    return <p className="py-20 text-center text-neutral-400">加载中...</p>;

  const typeEntries = Object.entries(stats.plan_type_distribution ?? {});

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">恢复计划</h2>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="总计划数" value={stats.total_plans} changeType="neutral" />
        <StatCard label="进行中" value={stats.active_plans} changeType="neutral" />
        <StatCard label="已完成" value={stats.completed_plans} changeType="neutral" />
        <StatCard
          label="完成率"
          value={`${stats.completion_rate}%`}
          changeType="neutral"
        />
      </div>

      {/* plan type distribution */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-medium text-neutral-600">
          计划类型分布
        </h3>
        {typeEntries.length === 0 ? (
          <p className="text-sm text-neutral-400">暂无数据</p>
        ) : (
          <div className="space-y-3">
            {typeEntries.map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3"
              >
                <span className="text-sm text-neutral-600">{type}</span>
                <span className="text-lg font-bold text-neutral-700">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* daily checkin rate (简单条形) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-medium text-neutral-600">
          最近14天每日打卡率
        </h3>
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {(stats.daily_checkin_rate ?? []).map((rate, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary-400 transition-all"
              style={{ height: `${Math.max(2, rate)}%` }}
              title={`${rate}%`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
          <span>14天前</span>
          <span>今天</span>
        </div>
      </div>

      <div className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-400">
        平均完成天数：{stats.avg_days_completed.toFixed(1)} 天
      </div>
    </div>
  );
}
