import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useAnalysis } from '../../hooks/useAnalysis.js';

const RELATIONSHIP_STAGES = [
  { value: 'ambiguous', label: '暧昧中' },
  { value: 'in-relationship', label: '恋爱中' },
  { value: 'after-breakup', label: '分手后' },
  { value: 'lost-contact', label: '失联中' },
] as const;

export function AnalysisPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);
  const ensureSession = useSessionStore((s) => s.ensureSession);

  const { result, status, error, analyze, reset } = useAnalysis();

  const [userGoal, setUserGoal] = useState('');
  const [stage, setStage] = useState<string>(RELATIONSHIP_STAGES[0].value);
  const [factsText, setFactsText] = useState('');
  const [userState, setUserState] = useState('');

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const canSubmit =
    userGoal.trim().length > 0 &&
    factsText.trim().length > 0 &&
    userState.trim().length > 0 &&
    status !== 'loading';

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSubmit) return;
    const facts = factsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const sessionId = await ensureSession();
    await analyze({
      session_id: sessionId,
      user_goal: userGoal.trim(),
      relationship_stage: stage,
      facts,
      user_state: userState.trim(),
    });
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
        <h1 className="text-sm font-medium text-warm-700">关系分析</h1>
        <nav className="flex gap-4 text-xs text-warm-700/60">
          <Link to="/chat" className="hover:text-warm-700">
            对话
          </Link>
          <Link to="/analysis" className="text-warm-700">
            分析
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <section className="rounded-lg border border-warm-100 bg-white p-5">
          <h2 className="mb-1 text-sm font-medium text-warm-700">
            描述你的处境
          </h2>
          <p className="mb-4 text-xs text-warm-700/60">
            分析基于你提供的事实，结论会保留不确定性，仅供参考。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="user-goal"
                className="mb-1 block text-xs text-warm-700/70"
              >
                你想弄清楚什么
              </label>
              <input
                id="user-goal"
                type="text"
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                placeholder="你想弄清楚什么？如：判断对方是否还有感情"
                className="w-full rounded-md border border-warm-100 bg-warm-50/50 px-3 py-2 text-sm text-warm-700 placeholder:text-warm-700/30 focus:border-warm-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="stage"
                className="mb-1 block text-xs text-warm-700/70"
              >
                关系阶段
              </label>
              <select
                id="stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-md border border-warm-100 bg-warm-50/50 px-3 py-2 text-sm text-warm-700 focus:border-warm-500 focus:outline-none"
              >
                {RELATIONSHIP_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="facts"
                className="mb-1 block text-xs text-warm-700/70"
              >
                客观事实（每行一条）
              </label>
              <textarea
                id="facts"
                value={factsText}
                onChange={(e) => setFactsText(e.target.value)}
                placeholder="描述你观察到的具体事实，每行一条"
                rows={6}
                className="w-full resize-none rounded-md border border-warm-100 bg-warm-50/50 px-3 py-2 text-sm text-warm-700 placeholder:text-warm-700/30 focus:border-warm-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="user-state"
                className="mb-1 block text-xs text-warm-700/70"
              >
                你现在的状态
              </label>
              <input
                id="user-state"
                type="text"
                value={userState}
                onChange={(e) => setUserState(e.target.value)}
                placeholder="你现在的情绪状态"
                className="w-full rounded-md border border-warm-100 bg-warm-50/50 px-3 py-2 text-sm text-warm-700 placeholder:text-warm-700/30 focus:border-warm-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-warm-500 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-warm-500/40"
              >
                {status === 'loading' ? '分析中…' : '开始分析'}
              </button>
            </div>
          </form>
        </section>

        {status === 'loading' ? (
          <div className="mt-6 rounded-lg border border-warm-100 bg-white p-5 text-sm text-warm-700/70">
            分析中…
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {status === 'success' && result ? (
          <AnalysisResultCards result={result} />
        ) : null}
      </main>
    </div>
  );
}

function AnalysisResultCards({
  result,
}: {
  result: import('@emotion/shared').AnalysisResult;
}): JSX.Element {
  const confidencePct = Math.round(result.confidence * 100);
  return (
    <div className="mt-6 space-y-4" data-testid="analysis-result">
      <article className="rounded-lg border border-warm-100 bg-white p-5">
        <h3 className="mb-2 text-xs font-medium text-warm-700/60">分析结论</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-warm-700">
          {result.analysis}
        </p>
      </article>

      {result.evidence.length > 0 ? (
        <article className="rounded-lg border border-warm-100 bg-white p-5">
          <h3 className="mb-2 text-xs font-medium text-warm-700/60">证据</h3>
          <ul className="space-y-1 text-sm text-warm-700">
            {result.evidence.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-warm-700/40">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {result.risks.length > 0 ? (
        <article className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="mb-2 text-xs font-medium text-amber-700/80">
            风险提示
          </h3>
          <ul className="space-y-1 text-sm text-amber-900">
            {result.risks.map((risk, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-amber-600/60">·</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <article className="rounded-lg border border-warm-100 bg-white p-5">
        <h3 className="mb-2 text-xs font-medium text-warm-700/60">建议</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-warm-700">
          {result.advice}
        </p>
      </article>

      <article className="rounded-lg border border-warm-100 bg-white p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-warm-700/60">
          <span>置信度</span>
          <span>{confidencePct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-warm-100"
          role="progressbar"
          aria-valuenow={confidencePct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-warm-500 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-warm-700/50">
          以上仅为基于已知事实的推断，请保留你自己的判断空间。
        </p>
      </article>
    </div>
  );
}
