import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useRecovery } from '../../hooks/useRecovery.js';
import type {
  RecoveryCheckin,
  RecoveryPlan,
  RecoveryPlanType,
} from '../../api/recovery.js';

const PLAN_OPTIONS: Array<{
  type: RecoveryPlanType;
  title: string;
  description: string;
  totalDays: number;
}> = [
  {
    type: '7-day-breakup',
    title: '7天走出失恋',
    description: '适合刚分手、反复联系的情况',
    totalDays: 7,
  },
  {
    type: '14-day-overthinking',
    title: '14天停止内耗',
    description: '适合暧昧期、反复纠结的情况',
    totalDays: 14,
  },
];

const PLAN_TITLE: Record<string, string> = {
  '7-day-breakup': '7天走出失恋',
  '14-day-overthinking': '14天停止内耗',
};

function planTitle(plan: RecoveryPlan): string {
  return PLAN_TITLE[plan.plan_type] ?? '我的恢复计划';
}

function formatDateTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
}

export function RecoveryPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const {
    plans,
    currentPlan,
    todayTask,
    checkins,
    status,
    error,
    fetchPlans,
    createPlan,
    submitCheckin,
  } = useRecovery();

  const [moodScore, setMoodScore] = useState<number>(5);
  const [reflection, setReflection] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [creatingType, setCreatingType] = useState<RecoveryPlanType | null>(
    null
  );
  const [justSubmittedCheckin, setJustSubmittedCheckin] =
    useState<RecoveryCheckin | null>(null);

  useEffect(() => {
    if (authStatus === 'authed') {
      void fetchPlans();
    }
  }, [authStatus, fetchPlans]);

  useEffect(() => {
    setJustSubmittedCheckin(null);
  }, [currentPlan?.id]);

  const todayCheckin: RecoveryCheckin | null = useMemo(() => {
    if (justSubmittedCheckin) return justSubmittedCheckin;
    if (!currentPlan) return null;
    return (
      checkins.find(
        (c) => c.day_index === currentPlan.current_day && c.completed
      ) ?? null
    );
  }, [checkins, currentPlan, justSubmittedCheckin]);

  const recentCheckins = useMemo(() => checkins.slice(0, 7), [checkins]);

  const hasActivePlan = Boolean(
    currentPlan && currentPlan.status === 'active'
  );

  const handleCreate = async (planType: RecoveryPlanType): Promise<void> => {
    setCreatingType(planType);
    try {
      await createPlan(planType);
    } finally {
      setCreatingType(null);
    }
  };

  const handleSubmitCheckin = async (): Promise<void> => {
    if (!currentPlan || todayCheckin) return;
    setSubmitting(true);
    try {
      const created = await submitCheckin(currentPlan.id, {
        mood_score: moodScore,
        reflection: reflection.trim() ? reflection.trim() : undefined,
      });
      if (created) {
        setJustSubmittedCheckin(created);
        setReflection('');
      }
    } finally {
      setSubmitting(false);
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
        <h1 className="text-sm font-medium text-warm-700">恢复计划</h1>
        <nav className="flex gap-4 text-xs text-warm-700/60">
          <Link to="/chat" className="hover:text-warm-700">
            对话
          </Link>
          <Link to="/analysis" className="hover:text-warm-700">
            分析
          </Link>
          <Link to="/recovery" className="text-warm-700">
            恢复
          </Link>
          <Link to="/growth" className="hover:text-warm-700">
            成长
          </Link>
          <Link to="/settings" className="hover:text-warm-700">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {status === 'loading' && plans.length === 0 ? (
          <div
            className="rounded-lg border border-warm-100 bg-white p-5 text-sm text-warm-700/70"
            data-testid="recovery-loading"
          >
            加载中…
          </div>
        ) : null}

        {error ? (
          <div
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            data-testid="recovery-error"
          >
            {error}
          </div>
        ) : null}

        {/* 无 active 计划：展示选项卡片 */}
        {!hasActivePlan && status !== 'loading' ? (
          <section data-testid="recovery-empty">
            <h2 className="mb-1 text-base font-medium text-warm-700">
              开始你的恢复计划
            </h2>
            <p className="mb-5 text-xs text-warm-700/50">
              选择一个适合你当下状态的计划,陪你一步步走出来。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  data-testid={`plan-option-${opt.type}`}
                  className="rounded-xl border border-warm-100 bg-white p-5 text-left shadow-sm transition hover:border-warm-500 disabled:opacity-60"
                  onClick={() => void handleCreate(opt.type)}
                  disabled={creatingType !== null}
                >
                  <h3 className="text-sm font-medium text-warm-700">
                    {opt.title}
                  </h3>
                  <p className="mt-2 text-xs text-warm-700/60">
                    {opt.description}
                  </p>
                  <p className="mt-3 text-xs text-warm-700/40">
                    共 {opt.totalDays} 天 ·
                    {creatingType === opt.type ? ' 创建中…' : ' 点击开始'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* 有 active 计划：展示进度 + 今日任务 + 打卡 */}
        {hasActivePlan && currentPlan ? (
          <section
            data-testid="recovery-active"
            className="flex flex-col gap-4"
          >
            <div className="rounded-xl border border-warm-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-warm-700">
                  {planTitle(currentPlan)}
                </h2>
                <span className="text-xs text-warm-700/50">
                  Day {currentPlan.current_day} / {currentPlan.total_days}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-warm-100">
                <div
                  className="h-full rounded-full bg-warm-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (currentPlan.current_day / currentPlan.total_days) * 100
                      )
                    )}%`,
                  }}
                  data-testid="recovery-progress-bar"
                />
              </div>
            </div>

            {todayTask ? (
              <div
                className="rounded-xl border border-warm-100 bg-white p-5"
                data-testid="recovery-today-task"
              >
                <h3 className="mb-2 text-sm font-medium text-warm-700">
                  今日任务
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-warm-700">
                  {todayTask.task}
                </p>
                <div className="mt-4 rounded-lg bg-warm-50 p-3">
                  <p className="text-xs text-warm-700/60">
                    思考一下:{todayTask.reflection_prompt}
                  </p>
                </div>
                <p className="mt-3 text-xs text-warm-700/50">
                  💛 {todayTask.encouragement}
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border border-warm-100 bg-white p-5">
              <h3 className="mb-3 text-sm font-medium text-warm-700">
                今日打卡
              </h3>
              {todayCheckin ? (
                <div
                  className="rounded-lg border border-warm-100 bg-warm-50 p-4 text-sm text-warm-700"
                  data-testid="recovery-checkin-done"
                >
                  ✔ 今日已打卡(心情 {todayCheckin.mood_score ?? '-'} / 10)
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="text-xs text-warm-700/70">
                    今天的心情:{moodScore} / 10
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={moodScore}
                      onChange={(e) => setMoodScore(Number(e.target.value))}
                      className="mt-2 w-full"
                      data-testid="recovery-mood-slider"
                    />
                  </label>
                  <label className="text-xs text-warm-700/70">
                    今日反思(可选)
                    <textarea
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      rows={3}
                      placeholder="写下今天的感受或一个小发现"
                      className="mt-2 w-full resize-none rounded-md border border-warm-100 bg-white px-3 py-2 text-sm text-warm-700 focus:border-warm-500 focus:outline-none"
                      data-testid="recovery-reflection-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="self-end rounded-md bg-warm-500 px-4 py-2 text-xs text-white hover:bg-warm-600 disabled:bg-warm-300"
                    onClick={() => void handleSubmitCheckin()}
                    disabled={submitting}
                    data-testid="recovery-checkin-submit"
                  >
                    {submitting ? '提交中…' : '完成今日打卡'}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-warm-100 bg-white p-5">
              <h3 className="mb-3 text-sm font-medium text-warm-700">
                最近打卡
              </h3>
              {recentCheckins.length === 0 ? (
                <p className="text-xs text-warm-700/50">
                  还没有打卡记录,从今天开始吧。
                </p>
              ) : (
                <ul className="space-y-2" data-testid="recovery-checkin-list">
                  {recentCheckins.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-warm-100 bg-warm-50 p-3 text-xs text-warm-700"
                    >
                      <div className="flex items-center justify-between">
                        <span>Day {c.day_index}</span>
                        <span className="text-warm-700/40">
                          {formatDateTime(c.created_at)}
                        </span>
                      </div>
                      {c.mood_score != null ? (
                        <p className="mt-1 text-warm-700/70">
                          心情:{c.mood_score} / 10
                        </p>
                      ) : null}
                      {c.reflection ? (
                        <p className="mt-1 whitespace-pre-wrap text-warm-700/70">
                          {c.reflection}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
