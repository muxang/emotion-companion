import { useEffect, useState } from 'react';
import { fetchOverview, type OverviewData } from '../../api/overview';
import StatCard from '../../components/ui/StatCard';

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

  // 后端返回 { users, conversations, modes, emotions, safety_triggers }
  const { users, conversations, modes, emotions, safety_triggers } = data;

  if (!users) {
    return (
      <p className="py-20 text-center text-neutral-400">
        数据加载异常，请检查 Admin API 是否正常运行
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">数据概览</h2>

      {/* 顶部指标卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="总用户数"
          value={users.total}
          change={`今日新增 +${users.today}`}
          changeType="positive"
        />
        <StatCard
          label="今日消息数"
          value={conversations.today_messages}
          change={`总消息 ${conversations.total_messages}`}
          changeType="neutral"
        />
        <StatCard
          label="Safety 触发"
          value={safety_triggers.total}
          change={safety_triggers.today > 0 ? `今日 ${safety_triggers.today}` : '今日无'}
          changeType={safety_triggers.today > 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="总会话数"
          value={conversations.total_sessions}
          change={`人均 ${conversations.avg_messages_per_user} 条消息`}
          changeType="neutral"
        />
      </div>

      {/* 对话模式分布 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-neutral-600">
            对话模式分布
          </h3>
          <div className="space-y-3">
            {Object.entries(modes ?? {}).map(([mode, count]) => (
              <div
                key={mode}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3"
              >
                <span className="text-sm text-neutral-600">{mode}</span>
                <span className="text-lg font-bold text-neutral-700">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 情绪分布 */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-neutral-600">
            情绪分布
          </h3>
          <div className="space-y-3">
            {Object.entries(emotions ?? {}).map(([emotion, count]) => (
              <div
                key={emotion}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3"
              >
                <span className="text-sm text-neutral-600">{emotion}</span>
                <span className="text-lg font-bold text-neutral-700">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Safety 触发详情 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-medium text-neutral-600">
          Safety 触发统计
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {safety_triggers.high}
            </div>
            <div className="mt-1 text-xs text-amber-500">High</div>
          </div>
          <div className="rounded-lg bg-red-50 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-red-600">
              {safety_triggers.critical}
            </div>
            <div className="mt-1 text-xs text-red-500">Critical</div>
          </div>
          <div className="rounded-lg bg-neutral-50 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-neutral-700">
              {safety_triggers.today}
            </div>
            <div className="mt-1 text-xs text-neutral-500">今日触发</div>
          </div>
        </div>
      </div>
    </div>
  );
}
