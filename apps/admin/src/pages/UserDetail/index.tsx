import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchUserDetail,
  fetchSessionMessages,
  type AdminUserDetail,
  type AdminMessage,
} from '../../api/users';
import LineChart from '../../components/charts/LineChart';
import Badge from '../../components/ui/Badge';
import { formatDate, formatDateTime, formatPercent, shortId } from '../../utils/format';

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
    fetchSessionMessages(id!, sessionId)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }

  if (error) return <p className="py-20 text-center text-red-400">{error}</p>;
  if (!data) return <p className="py-20 text-center text-neutral-400">加载中...</p>;

  const { user, stats, emotion_trend, relationship_entities, recovery_plan, sessions } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-800">用户详情</h2>

      {/* basic info card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <div>
            <span className="text-neutral-400">ID：</span>
            <span className="font-mono">{user.anonymous_id}</span>
          </div>
          <div>
            <span className="text-neutral-400">注册：</span>
            {formatDateTime(user.created_at)}
          </div>
          <div>
            <span className="text-neutral-400">最后活跃：</span>
            {formatDateTime(user.last_active_at)}
          </div>
          <div>
            <span className="text-neutral-400">语气偏好：</span>
            {user.tone_preference ?? '-'}
          </div>
          <div>
            <span className="text-neutral-400">记忆：</span>
            {user.memory_enabled ? (
              <span className="text-emerald-500">开</span>
            ) : (
              <span className="text-neutral-400">关</span>
            )}
          </div>
        </div>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总会话数', value: stats.session_count },
          { label: '总消息数', value: stats.message_count },
          { label: '活跃天数', value: stats.active_days },
          { label: '主要情绪', value: stats.main_emotion ?? '-' },
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

      {/* emotion trend */}
      {emotion_trend.length > 0 && (
        <LineChart
          data={emotion_trend}
          xKey="date"
          yKey="score"
          title="情绪趋势（最近14天）"
          color="#8b5cf6"
        />
      )}

      {/* relationship entities */}
      {relationship_entities.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">关系对象</h3>
          <div className="flex flex-wrap gap-2">
            {relationship_entities.map((re) => (
              <span
                key={re.id}
                className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700"
              >
                {re.label} · {re.relation_type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* recovery plan */}
      {recovery_plan && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-600">恢复计划</h3>
          <div className="flex gap-8 text-sm">
            <div>
              <span className="text-neutral-400">类型：</span>
              {recovery_plan.plan_type}
            </div>
            <div>
              <span className="text-neutral-400">进度：</span>
              {formatPercent(recovery_plan.progress)}
            </div>
            <div>
              <span className="text-neutral-400">状态：</span>
              {recovery_plan.status}
            </div>
            <div>
              <span className="text-neutral-400">开始：</span>
              {formatDate(recovery_plan.started_at)}
            </div>
          </div>
        </div>
      )}

      {/* sessions */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-medium text-neutral-600">会话列表</h3>
        </div>
        {sessions.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">
            暂无会话
          </p>
        )}
        {sessions.map((sess) => (
          <div key={sess.id} className="border-b border-neutral-100 last:border-0">
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
                <span>{expandedSession === sess.id ? '收起 ▲' : '展开 ▼'}</span>
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
                              : 'bg-white border border-neutral-200 text-neutral-700'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                            <span>{formatDateTime(msg.created_at)}</span>
                            {msg.risk_level && (
                              <Badge value={msg.risk_level} variant="risk" />
                            )}
                            {msg.emotion_state && (
                              <Badge value={msg.emotion_state} variant="emotion" />
                            )}
                            {msg.next_mode && (
                              <Badge value={msg.next_mode} variant="mode" />
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
