import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import {
  deleteMemory,
  getEmotionTrend,
  getPatterns,
  getTimeline,
  type EmotionTrendResult,
  type GrowthFeed,
  type PatternsResponse,
  type RelationshipPattern,
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

type TabId = 'emotion' | 'patterns' | 'timeline';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'emotion', label: '情绪状态' },
  { id: 'patterns', label: '关系模式' },
  { id: 'timeline', label: '成长记录' },
];

const SUB_TYPE_LABELS: Record<string, string> = {
  silent_interpretation: '沉默解读型',
  word_interpretation: '话语解读型',
  behavior_interpretation: '行为解读型',
  unrecognized_giving: '付出不被看见',
  fear_driven_giving: '恐惧驱动型',
  habit_giving: '习惯付出型',
  ai_approval: '向AI求证型',
  direct_approval: '直接逼问型',
  indirect_approval: '间接求证型',
  worth_doubt: '价值感怀疑',
  retrospective_blame: '事后归咎型',
  reflex_blame: '条件反射型',
  say_give_up_keep_trying: '嘴上放弃型',
  waiting_clarity: '等对方想清楚',
  passive_tolerance: '被动接受型',
  digital_stalking: '数字窥探型',
  contact_impulse: '联系冲动型',
  general_boundary: '泛边界失守',
};

export function GrowthPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const [activeTab, setActiveTab] = useState<TabId>('emotion');
  const [feed, setFeed] = useState<GrowthFeed>({
    events: [],
    entities: [],
    summaries: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trendData, setTrendData] = useState<EmotionTrendResult | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [patternsData, setPatternsData] = useState<PatternsResponse | null>(
    null
  );
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [expandedNextStep, setExpandedNextStep] = useState<number | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<string | null>(null);

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

  const loadTrend = async (): Promise<void> => {
    setTrendLoading(true);
    try {
      const data = await getEmotionTrend(7);
      setTrendData(data);
    } catch {
      // 静默
    } finally {
      setTrendLoading(false);
    }
  };

  const loadPatterns = async (): Promise<void> => {
    setPatternsLoading(true);
    try {
      const data = await getPatterns();
      setPatternsData(data);
    } catch {
      // 静默
    } finally {
      setPatternsLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'authed') {
      void loadTimeline();
      void loadTrend();
      void loadPatterns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isCompletelyEmpty =
    feed.events.length === 0 &&
    feed.entities.length === 0 &&
    feed.summaries.length === 0;

  // 过滤时间线事件
  const filteredEvents =
    timelineFilter === null
      ? feed.events
      : feed.events.filter((evt) => {
          if (timelineFilter === '记录')
            return !(evt.event_type in EVENT_TYPE_LABEL);
          return labelOf(evt.event_type) === timelineFilter;
        });

  // 情绪标签云数据（从 patternsData 里没有情绪数据，用 summaries 间接展示）
  // 暂时从趋势 API 获取 — 如果有的话
  const emotionTrend = patternsData as unknown as {
    patterns?: unknown[];
  } | null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <h1 className="text-[15px] font-semibold text-neutral-800">
          我的成长记录
        </h1>
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
        {/* 页面标题 */}
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-neutral-800">
            我的成长记录
          </h1>
          <p className="mt-1 text-[13px] text-neutral-400">
            记录你走过的每一步
          </p>
        </div>

        {/* Tab 导航 */}
        <div className="mb-6 flex gap-1 rounded-2xl bg-neutral-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 rounded-xl px-4 py-2 text-[14px] transition-all',
                activeTab === tab.id
                  ? 'bg-white font-medium text-primary-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ============ Tab 1: 情绪状态 ============ */}
        <div className={activeTab === 'emotion' ? '' : 'hidden'}>
          {trendLoading || loading ? (
            <div className="space-y-3">
              <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
            </div>
          ) : (
            <>
              {/* 情绪趋势卡片 */}
              <EmotionTrendCard data={trendData} />

              {/* 最近回顾 */}
              {feed.summaries.length > 0 ? (
                <SummariesSection summaries={feed.summaries} />
              ) : null}

              {/* 关系对象标签 */}
              {feed.entities.length > 0 ? (
                <EntitiesSection entities={feed.entities} />
              ) : null}
            </>
          )}
        </div>

        {/* ============ Tab 2: 关系模式 ============ */}
        <div className={activeTab === 'patterns' ? '' : 'hidden'}>
          <PatternsSection
            data={patternsData}
            loading={patternsLoading}
            expandedNextStep={expandedNextStep}
            onToggleNextStep={(i) =>
              setExpandedNextStep(expandedNextStep === i ? null : i)
            }
          />
          <p className="mt-4 text-center text-[12px] text-neutral-400">
            基于你最近的对话分析,每24小时更新一次
          </p>
        </div>

        {/* ============ Tab 3: 成长记录 ============ */}
        <div className={activeTab === 'timeline' ? '' : 'hidden'}>
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

          {!loading && !error && isCompletelyEmpty ? (
            <div
              className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-[15px] text-neutral-400"
              data-testid="growth-empty"
            >
              还没有记录,多聊几次后这里会出现你的成长足迹
            </div>
          ) : null}

          {/* 时间线筛选栏 */}
          {!loading && !error && feed.events.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {[null, '分手', '复合', '冷战', '失联', '记录'].map((f) => (
                <button
                  key={f ?? 'all'}
                  type="button"
                  onClick={() => setTimelineFilter(f)}
                  className={[
                    'rounded-full border px-3 py-1 text-[12px] transition-colors',
                    timelineFilter === f
                      ? 'border-primary-200 bg-primary-100 text-primary-600'
                      : 'border-neutral-200 bg-white text-neutral-500 hover:border-primary-200',
                  ].join(' ')}
                >
                  {f ?? '全部'}
                </button>
              ))}
            </div>
          ) : null}

          {!loading && !error && filteredEvents.length > 0 ? (
            <EventsSection
              events={filteredEvents}
              formatDate={formatDate}
              labelOf={labelOf}
            />
          ) : null}

          {/* 清除记忆 */}
          <div className="mt-8 flex justify-center border-t border-neutral-100 pt-4">
            <button
              type="button"
              className="text-[13px] text-neutral-400 underline underline-offset-2 transition-colors hover:text-red-400"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
            >
              清除记忆
            </button>
          </div>
        </div>
      </main>

      {/* 确认弹窗 */}
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
// 子组件
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

// ============================================================
// 情绪趋势卡片
// ============================================================

const EMOTION_CN: Record<string, string> = {
  desperate: '绝望',
  numb: '麻木',
  sad: '悲伤',
  angry: '生气',
  anxious: '焦虑',
  lonely: '孤独',
  confused: '困惑',
  mixed: '复杂',
};

function EmotionTrendCard({
  data,
}: {
  data: EmotionTrendResult | null;
}): JSX.Element {
  if (!data || !data.trend) {
    return (
      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-[14px] font-medium text-neutral-700">
          近7天情绪状态
        </h2>
        <p className="mt-2 text-[13px] text-neutral-500">
          {data?.message ?? '继续聊几次,这里会显示你的情绪变化趋势'}
        </p>
      </div>
    );
  }

  const trend = data.trend;
  const dirMeta =
    trend.direction === 'improving'
      ? { text: '在好转', color: 'text-primary-600' }
      : trend.direction === 'declining'
        ? { text: '有些低落', color: 'text-amber-600' }
        : { text: '比较平稳', color: 'text-neutral-500' };

  const widthPct = Math.max(0, Math.min(100, (trend.average_score / 10) * 100));

  // 情绪标签云
  const emotionEntries = Object.entries(trend.mention_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-neutral-700">
          近7天情绪状态
        </h2>
        <span className={`text-[13px] ${dirMeta.color}`}>{dirMeta.text}</span>
      </div>
      <hr className="my-3 border-t border-neutral-100" />
      <p className="text-[13px] text-neutral-500">{data.message}</p>

      {/* 进度条 */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-primary-400 transition-all duration-700"
            style={{ width: `${widthPct}%` }}
          />
        </div>
        <span className="shrink-0 text-[12px] text-neutral-400">
          {trend.average_score.toFixed(1)}/10
        </span>
      </div>

      {/* 情绪标签云 */}
      {emotionEntries.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {emotionEntries.map(([emotion, count]) => (
            <span
              key={emotion}
              className="rounded-full bg-neutral-50 px-2.5 py-1 text-[12px] text-neutral-500"
            >
              {EMOTION_CN[emotion] ?? emotion} {count}次
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// 隐性模式发现器
// ============================================================

function PatternsSection({
  data,
  loading,
  expandedNextStep,
  onToggleNextStep,
}: {
  data: PatternsResponse | null;
  loading: boolean;
  expandedNextStep: number | null;
  onToggleNextStep: (index: number) => void;
}): JSX.Element | null {
  if (loading) {
    return (
      <section className="mb-6">
        <p className="mb-3 text-center text-[13px] text-neutral-400">
          正在分析你的对话模式...
        </p>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-neutral-100"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  if (!data.sufficient_data || data.patterns.length === 0) {
    return (
      <section className="mb-6">
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-5 text-center text-[13px] text-neutral-400">
          {data.message}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6" data-testid="patterns-section">
      {data.patterns.map((p, i) => (
        <PatternCard
          key={p.pattern_type}
          pattern={p}
          index={i}
          expanded={expandedNextStep === i}
          onToggle={() => onToggleNextStep(i)}
        />
      ))}
    </section>
  );
}

function PatternCard({
  pattern: p,
  index,
  expanded,
  onToggle,
}: {
  pattern: RelationshipPattern;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className="mb-4 cursor-default rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-primary-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-700">
            {p.title}
          </span>
          {p.sub_type ? (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400">
              {SUB_TYPE_LABELS[p.sub_type] ?? p.sub_type}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] text-neutral-400">
          匹配度 {Math.round(p.confidence * 100)}%
        </span>
      </div>

      <p className="mt-2 text-[14px] italic text-neutral-500">{p.subtitle}</p>

      <div className="my-3 border-t border-neutral-100" />

      <div className="whitespace-pre-line text-[14px] leading-[1.85] text-neutral-700">
        {p.description}
      </div>

      {p.hit_examples.length > 0 ? (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="mb-1 text-[12px] text-neutral-400">你说过：</p>
          {p.hit_examples.map((ex, j) => (
            <p key={j} className="mt-1 text-[12px] italic text-neutral-400">
              &ldquo;{ex}...&rdquo;
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-[14px] text-amber-400">⚡</span>
          <p className="text-[13px] leading-relaxed text-amber-700">
            {p.real_cost}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-[18px] leading-none text-primary-400">
            ·
          </span>
          <p className="text-[13px] leading-relaxed text-primary-600">
            {p.suggestion}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-[12px] text-neutral-400 transition-colors hover:text-primary-500"
        >
          {expanded ? '收起 ↑' : '展开第一步 ↓'}
        </button>
        {expanded ? (
          <div className="mt-2 rounded-xl bg-primary-50/50 p-3">
            <p className="text-[13px] leading-relaxed text-neutral-600">
              {p.next_step}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
