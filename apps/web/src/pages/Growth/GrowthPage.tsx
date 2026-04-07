import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import {
  deleteMemory,
  getTimeline,
  type TimelineEvent,
} from '../../api/memory.js';

const EVENT_TYPE_LABEL: Record<string, string> = {
  breakup: '分手',
  reconcile: '复合',
  'cold-war': '冷战',
  'lost-contact': '失联',
};

function labelOf(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? '记录';
}

function formatDate(input: string | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function GrowthPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTimeline = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await getTimeline();
      // 后端通常已倒序，这里再保险一次按 created_at 倒序
      const sorted = [...list].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      setEvents(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败,请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'authed') {
      void loadTimeline();
    }
  }, [authStatus]);

  const handleConfirmDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await deleteMemory();
      setEvents([]);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败,请稍后再试');
    } finally {
      setDeleting(false);
    }
  };

  if (authStatus !== 'authed') {
    return (
      <div className="flex h-screen items-center justify-center text-warm-700/70">
        <p className="text-sm">
          {authStatus === 'error' ? `登录失败：${authError}` : '正在登录…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-warm-50">
      <header className="flex items-center justify-between border-b border-warm-100 bg-white px-6 py-3">
        <h1 className="text-sm font-medium text-warm-700">我的成长记录</h1>
        <nav className="flex gap-4 text-xs text-warm-700/60">
          <Link to="/chat" className="hover:text-warm-700">
            对话
          </Link>
          <Link to="/analysis" className="hover:text-warm-700">
            分析
          </Link>
          <Link to="/growth" className="text-warm-700">
            成长
          </Link>
          <Link to="/settings" className="hover:text-warm-700">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {loading ? (
          <div
            className="rounded-lg border border-warm-100 bg-white p-5 text-sm text-warm-700/70"
            data-testid="growth-loading"
          >
            加载中…
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!loading && !error && events.length === 0 ? (
          <div
            className="rounded-lg border border-warm-100 bg-white p-8 text-center text-sm text-warm-700/60"
            data-testid="growth-empty"
          >
            还没有记录，多聊几次后这里会出现你的成长足迹
          </div>
        ) : null}

        {!loading && !error && events.length > 0 ? (
          <ul className="space-y-3" data-testid="growth-timeline">
            {events.map((evt) => (
              <li
                key={evt.id}
                className="rounded-lg border border-warm-100 bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-700">
                    {labelOf(evt.event_type)}
                  </span>
                  <span className="text-xs text-warm-700/40">
                    {formatDate(evt.event_time ?? evt.created_at)}
                  </span>
                </div>
                {evt.entity_label ? (
                  <p className="mb-1 text-xs text-warm-700/50">
                    关于 {evt.entity_label}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-warm-700">
                  {evt.summary}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-rose-200 bg-white px-4 py-2 text-xs text-rose-600 hover:bg-rose-50"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            清除记忆
          </button>
        </div>
      </main>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div className="w-[20rem] rounded-lg bg-white p-5 shadow-xl">
            <h3
              id="confirm-delete-title"
              className="mb-2 text-sm font-medium text-warm-700"
            >
              确认清除记忆?
            </h3>
            <p className="mb-4 text-xs text-warm-700/60">
              清除后,系统将不再记得过往对话的关键事件与关系信息。此操作不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs text-warm-700/70 hover:bg-warm-50"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-rose-500 px-3 py-1.5 text-xs text-white hover:bg-rose-600 disabled:bg-rose-300"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
              >
                {deleting ? '清除中…' : '确认清除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
