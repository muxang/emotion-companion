import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useAnalysis } from '../../hooks/useAnalysis.js';

const TEXT_MIN = 10;
const TEXT_MAX = 1000;

const PLACEHOLDER =
  '描述你的情况，比如：暧昧三个月，他从不主动联系我，只在深夜回消息，我不知道要不要继续等。';

export function AnalysisPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const { result, status, error, analyze, reset } = useAnalysis();

  const [userText, setUserText] = useState('');

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const trimmedLen = userText.trim().length;
  const canSubmit =
    trimmedLen >= TEXT_MIN &&
    trimmedLen <= TEXT_MAX &&
    status !== 'loading';

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSubmit) return;
    await analyze(userText.trim());
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
        <h1 className="text-[15px] font-semibold text-neutral-800">关系分析</h1>
        <nav className="flex gap-4 text-xs text-neutral-400">
          <Link to="/chat" className="hover:text-primary-600">
            对话
          </Link>
          <Link to="/analysis" className="text-primary-600">
            分析
          </Link>
          <Link to="/recovery" className="hover:text-primary-600">
            恢复
          </Link>
          <Link to="/growth" className="hover:text-primary-600">
            成长
          </Link>
          <Link to="/settings" className="hover:text-primary-600">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-1 text-[16px] font-medium text-neutral-800">
            描述你的处境
          </h2>
          <p className="mb-4 text-xs text-neutral-400">
            分析基于你提供的事实，结论会保留不确定性，仅供参考。
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="analysis-text"
                className="mb-1 block text-[14px] font-medium text-neutral-600"
              >
                你想说说什么？
              </label>
              <textarea
                id="analysis-text"
                aria-label="情况描述"
                value={userText}
                onChange={(e) => setUserText(e.target.value.slice(0, TEXT_MAX))}
                placeholder={PLACEHOLDER}
                rows={6}
                className="min-h-[8rem] w-full resize-y rounded-md border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-[15px] leading-[1.8] text-neutral-800 placeholder:text-neutral-400/60 focus:border-primary-400 focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between text-xs">
                <span
                  className={
                    trimmedLen > 0 && trimmedLen < TEXT_MIN
                      ? 'text-risk-medium'
                      : 'text-neutral-400'
                  }
                >
                  {trimmedLen > 0 && trimmedLen < TEXT_MIN
                    ? `至少 ${TEXT_MIN} 字`
                    : '事实越具体，分析越准确'}
                </span>
                <span className="text-neutral-400">
                  已输入 {trimmedLen} / {TEXT_MAX} 字
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-xl bg-primary-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === 'loading' ? '分析中…' : '开始分析'}
              </button>
            </div>
          </form>
        </section>

        {status === 'loading' ? (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-400">
            AI 正在分析中，通常需要 10-20 秒…
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
  const confidencePct = Math.round((result.confidence ?? 0) * 100);
  const evidence = result.evidence ?? [];
  const risks = result.risks ?? [];
  return (
    <div className="mt-6 space-y-4" data-testid="analysis-result">
      <article className="rounded-lg border-l-4 border-primary-400 border-t border-r border-b border-neutral-200 bg-white p-5">
        <h3 className="mb-2 text-xs font-medium text-neutral-400">分析结论</h3>
        <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-neutral-800">
          {result.analysis}
        </p>
      </article>

      {evidence.length > 0 ? (
        <article className="rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="mb-2 text-xs font-medium text-neutral-400">证据</h3>
          <ul className="space-y-1">
            {evidence.map((item, idx) => (
              <li key={idx} className="mb-2 flex gap-2 text-[14px] leading-relaxed text-neutral-800">
                <span className="text-neutral-400">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {risks.length > 0 ? (
        <article className="rounded-lg border-l-4 border-risk-medium border-t border-r border-b border-neutral-200 bg-white p-5">
          <h3 className="mb-2 text-xs font-medium text-neutral-600">
            风险提示
          </h3>
          <ul className="space-y-1 text-sm text-neutral-800">
            {risks.map((risk, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-risk-medium/70">·</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <article className="rounded-lg border border-neutral-200 bg-white p-5">
        <h3 className="mb-2 text-xs font-medium text-neutral-400">建议</h3>
        <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-neutral-800">
          {result.advice}
        </p>
      </article>

      <article className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-2 flex items-center justify-between text-[13px] text-neutral-400">
          <span>置信度</span>
          <span>{confidencePct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
          aria-valuenow={confidencePct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary-400 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <p className="mt-2 text-[13px] text-neutral-400">
          以上仅为基于已知事实的推断，请保留你自己的判断空间。
        </p>
      </article>
    </div>
  );
}
