import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import {
  deleteMemory,
  getTimeline,
  type GrowthFeed,
  type TimelineEntity,
  type TimelineEvent,
  type TimelineSummary,
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

  const [feed, setFeed] = useState<GrowthFeed>({
    events: [],
    entities: [],
    summaries: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTimeline = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTimeline();
      setFeed({
        events: [...data.events].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        ),
        entities: [...data.entities].sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at)
        ),
        summaries: [...data.summaries].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        ),
      });
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
      setFeed({ events: [], entities: [], summaries: [] });
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败,请稍后再试');
    } finally {
      setDeleting(false);
    }
  };

  if (authStatus !== 'authed') {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        <p className="text-sm">
          {authStatus === 'error' ? `登录失败：${authError}` : '正在登录…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <h1 className="text-[15px] font-semibold text-neutral-800">我的成长记录</h1>
        <nav className="flex gap-4 text-xs text-neutral-400">
          <Link to="/chat" className="hover:text-primary-600">
            对话
          </Link>
          <Link to="/analysis" className="hover:text-primary-600">
            分析
          </Link>
          <Link to="/recovery" className="hover:text-primary-600">
            恢复
          </Link>
          <Link to="/growth" className="text-primary-600">
            成长
          </Link>
          <Link to="/settings" className="hover:text-primary-600">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {loading ? (
          <div
            className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-400"
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

        {!loading && !error && feed.events.length === 0 && feed.entities.length === 0 && feed.summaries.length === 0 ? (
          <div
            className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-[15px] text-neutral-400"
            data-testid="growth-empty"
          >
            还没有记录,多聊几次后这里会出现你的成长足迹
          </div>
        ) : null}

        {!loading && !error && feed.summaries.length > 0 ? (
          <SummariesSection summaries={feed.summaries} />
        ) : null}

        {!loading && !error && feed.entities.length > 0 ? (
          <EntitiesSection entities={feed.entities} />
        ) : null}

        {!loading && !error && feed.events.length > 0 ? (
          <EventsSection events={feed.events} formatDate={formatDate} labelOf={labelOf} />
        ) : null}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-rose-200 bg-white px-4 py-2 text-[14px] text-rose-600 hover:bg-rose-50"
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
              className="mb-2 text-sm font-medium text-neutral-800"
            >
              确认清除记忆?
            </h3>
            <p className="mb-4 text-xs text-neutral-400">
              清除后,系统将不再记得过往对话的关键事件与关系信息。此操作不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-rose-500 px-3 py-1.5 text-xs text-white hover:bg-rose-600 disabled:opacity-40"
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

// ============================================================
// 三段式成长 feed 子组件
// ============================================================

function SummariesSection({
  summaries,
}: {
  summaries: TimelineSummary[];
}): JSX.Element {
  return (
    <section className="mb-6" data-testid="growth-summaries">
      <h2 className="mb-2 text-xs font-medium text-neutral-400">最近回顾</h2>
      <ul className="space-y-3">
        {summaries.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-800">
              {s.summary_text}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              {new Date(s.created_at).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const RELATION_TYPE_LABEL: Record<string, string> = {
  ex: '前任',
  partner: '伴侣',
  ambiguous: '暧昧对象',
  friend: '朋友',
  family: '家人',
  other: '其他',
};

function EntitiesSection({
  entities,
}: {
  entities: TimelineEntity[];
}): JSX.Element {
  return (
    <section className="mb-6" data-testid="growth-entities">
      <h2 className="mb-2 text-xs font-medium text-neutral-400">关系对象</h2>
      <div className="flex flex-wrap gap-2">
        {entities.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-800"
          >
            <span className="font-medium">{e.label}</span>
            {e.relation_type ? (
              <span className="text-neutral-400">
                · {RELATION_TYPE_LABEL[e.relation_type] ?? e.relation_type}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

function EventsSection({
  events,
  formatDate,
  labelOf,
}: {
  events: TimelineEvent[];
  formatDate: (input: string | null) => string;
  labelOf: (eventType: string) => string;
}): JSX.Element {
  return (
    <section className="mb-6" data-testid="growth-timeline">
      <h2 className="mb-2 text-xs font-medium text-neutral-400">关键事件</h2>
      <ul className="space-y-3">
        {events.map((evt) => (
          <li
            key={evt.id}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[12px] text-primary-700">
                {labelOf(evt.event_type)}
              </span>
              <span className="text-[12px] text-neutral-400">
                {formatDate(evt.event_time ?? evt.created_at)}
              </span>
            </div>
            {evt.entity_label ? (
              <p className="mb-1 text-xs text-neutral-400">
                关于 {evt.entity_label}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-800">
              {evt.summary}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
