import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchUserDetail,
  fetchSessionMessages,
  type AdminUserDetail,
  type AdminMessage,
} from '../../api/users';
import Badge from '../../components/ui/Badge';
import { formatDateTime, shortId } from '../../utils/format';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchUserDetail(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  function toggleSession(sessionId: string) {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setMessages([]);
      return;
    }
    setExpandedSession(sessionId);
    setMessagesLoading(true);
    // fetchSessionMessages 返回 { session, messages }，只取 messages
    fetchSessionMessages(id!, sessionId)
      .then((res) => setMessages(res.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }

  if (error) return <p className="py-20 text-center text-red-400">{error}</p>;
  if (!data)
    return (
      <p className="py-20 text-center text-neutral-400">加载中...</p>
    );

  const {
    user,
    stats,
    emotion_trend,
    relationship_entities,
    active_plan,
    recent_sessions,
  } = data;

  // 安全兜底：任何子字段可能因后端版本差异缺失
  const safeStats = stats ?? {
    total_sessions: 0,
    total_messages: 0,
    avg_risk_level: null,
    dominant_emotion: null,
    days_active: 0,
  };
  const safeSessions = recent_sessions ?? [];
  const safeEntities = relationship_entities ?? [];
  const dailyTrend = emotion_trend?.daily ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">用户详情</h2>

      {/* basic info card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <div>
            <span className="text-neutral-400">ID：</span>
            <span className="font-mono">{user?.anonymous_id ?? '-'}</span>
          </div>
          <div>
            <span className="text-neutral-400">注册：</span>
            {formatDateTime(user?.created_at)}
          </div>
          <div>
            <span className="text-neutral-400">语气偏好：</span>
            {user?.tone_preference ?? '-'}
          </div>
          <div>
            <span className="text-neutral-400">记忆：</span>
            {user?.memory_enabled ? (
              <span className="text-emerald-500">开</span>
            ) : (
              <span className="text-neutral-400">关</span>
            )}
          </div>
        </div>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: '总会话数', value: safeStats.total_sessions },
          { label: '总消息数', value: safeStats.total_messages },
          { label: '活跃天数', value: safeStats.days_active },
          { label: '主要情绪', value: safeStats.dominant_emotion ?? '-' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-neutral-200 bg-white px-5 py-4 text-center"
          >
            <p className="text-2xl font-bold text-neutral-800">{s.value}</p>
            <p className="text-xs text-neutral-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* emotion trend (simple bar chart) */}
      {dailyTrend.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-neutral-600">
            情绪趋势（最近14天）
          </h3>
          <div className="flex items-end gap-1" style={{ height: 100 }}>
            {dailyTrend.map((d, i) => {
              const score = d.avg_score ?? 0;
              const pct = Math.max(5, (score / 10) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary-400 transition-all"
                  style={{ height: `${pct}%` }}
                  title={`${d.date}: ${score > 0 ? score.toFixed(1) : '-'}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
            <span>{dailyTrend[0]?.date ?? ''}</span>
            <span>{dailyTrend[dailyTrend.length - 1]?.date ?? ''}</span>
          </div>
        </div>
      )}

      {/* relationship entities */}
      {safeEntities.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">
            关系对象
          </h3>
          <div className="flex flex-wrap gap-2">
            {safeEntities.map((re) => (
              <span
                key={re.id}
                className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700"
              >
                {re.label}
                {re.relation_type ? ` · ${re.relation_type}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* active recovery plan */}
      {active_plan && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">
            恢复计划
          </h3>
          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <span className="text-neutral-400">类型：</span>
              {active_plan.plan_type}
            </div>
            <div>
              <span className="text-neutral-400">进度：</span>
              Day {active_plan.current_day} / {active_plan.total_days}
            </div>
            <div>
              <span className="text-neutral-400">状态：</span>
              {active_plan.status}
            </div>
          </div>
        </div>
      )}

      {/* sessions */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-medium text-neutral-600">
            最近会话（{safeSessions.length}）
          </h3>
        </div>
        {safeSessions.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">
            暂无会话
          </p>
        )}
        {safeSessions.map((sess) => (
          <div
            key={sess.id}
            className="border-b border-neutral-100 last:border-0"
          >
            <button
              type="button"
              onClick={() => toggleSession(sess.id)}
              className="flex w-full items-center justify-between px-5 py-3 text-left text-sm transition hover:bg-neutral-50"
            >
              <span className="text-neutral-700">
                {sess.title || shortId(sess.id)}
              </span>
              <span className="flex items-center gap-4 text-xs text-neutral-400">
                <span>{sess.message_count} 条消息</span>
                <span>{formatDateTime(sess.created_at)}</span>
                <span>
                  {expandedSession === sess.id ? '收起 ▲' : '展开 ▼'}
                </span>
              </span>
            </button>

            {expandedSession === sess.id && (
              <div className="bg-neutral-50 px-5 py-4">
                {messagesLoading && (
                  <p className="text-sm text-neutral-400">加载中...</p>
                )}
                {!messagesLoading && messages.length === 0 && (
                  <p className="text-sm text-neutral-400">暂无消息</p>
                )}
                <div className="space-y-3">
                  {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                            isUser
                              ? 'bg-primary-100 text-primary-900'
                              : 'border border-neutral-200 bg-white text-neutral-700'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                            <span>{formatDateTime(msg.created_at)}</span>
                            {msg.risk_level && (
                              <Badge value={msg.risk_level} variant="risk" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
