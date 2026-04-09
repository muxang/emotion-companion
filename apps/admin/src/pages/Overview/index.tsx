import { useEffect, useState } from 'react';
import { fetchOverview, type OverviewData } from '../../api/overview';
import StatCard from '../../components/ui/StatCard';
import LineChart from '../../components/charts/LineChart';
import PieChart from '../../components/charts/PieChart';
import BarChart from '../../components/charts/BarChart';
import Badge from '../../components/ui/Badge';
import { formatPercent, diffPercent } from '../../utils/format';

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <p className="py-20 text-center text-red-400">{error}</p>;
  }

  if (!data) {
    return <p className="py-20 text-center text-neutral-400">加载中...</p>;
  }

  const { stats, message_trend, mode_share, emotion_share, safety_share } = data;

  const msgDiff = diffPercent(stats.messages_today, stats.messages_yesterday);
  const msgChangeStr =
    msgDiff === 0
      ? '与昨日持平'
      : `较昨日 ${msgDiff > 0 ? '+' : ''}${(msgDiff * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">数据概览</h2>

      {/* top stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="总用户数"
          value={stats.total_users}
          change={`今日新增 +${stats.new_users_today}`}
          changeType="positive"
        />
        <StatCard
          label="今日消息数"
          value={stats.messages_today}
          change={msgChangeStr}
          changeType={msgDiff >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Safety 触发率"
          value={formatPercent(stats.safety_trigger_rate)}
          changeType="neutral"
        />
        <StatCard
          label="计划完成率"
          value={formatPercent(stats.plan_completion_rate)}
          changeType="neutral"
        />
      </div>

      {/* charts row 1 */}
      <div className="grid grid-cols-2 gap-4">
        <LineChart
          data={message_trend}
          xKey="date"
          yKey="count"
          title="最近14天消息量"
        />
        <PieChart
          data={mode_share.map((m) => ({ name: m.mode, value: m.count }))}
          title="对话模式占比"
        />
      </div>

      {/* charts row 2 */}
      <div className="grid grid-cols-2 gap-4">
        <BarChart
          data={emotion_share}
          xKey="emotion"
          yKey="count"
          title="情绪分布"
          color="#8b5cf6"
        />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-neutral-600">
            Safety 触发统计
          </h3>
          <div className="space-y-3">
            {safety_share.map((s) => (
              <div
                key={s.level}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3"
              >
                <Badge value={s.level} variant="risk" />
                <span className="text-xl font-bold text-neutral-700">
                  {s.count}
                </span>
                {s.today_count !== undefined && s.today_count > 0 && (
                  <span className="text-xs text-red-400">
                    今日 {s.today_count}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
