import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useSettings } from '../../hooks/useSettings.js';
import type { TonePreference } from '../../api/settings.js';

const TONE_OPTIONS: Array<{
  value: TonePreference;
  title: string;
  desc: string;
}> = [
  { value: 'warm', title: '温柔陪伴', desc: '更多共情与情绪承接' },
  { value: 'rational', title: '理性分析', desc: '聚焦事实与边界判断' },
  { value: 'direct', title: '简洁直接', desc: '少铺垫,直说重点' },
];

export function SettingsPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const { memoryEnabled, tonePreference, status, error, updateSettings } =
    useSettings();

  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleToggleMemory = async (): Promise<void> => {
    setSaving(true);
    setLocalError(null);
    try {
      await updateSettings({ memory_enabled: !memoryEnabled });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToneChange = async (value: TonePreference): Promise<void> => {
    if (value === tonePreference) return;
    setSaving(true);
    setLocalError(null);
    try {
      await updateSettings({ tone_preference: value });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
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
        <h1 className="text-sm font-medium text-warm-700">设置</h1>
        <nav className="flex gap-4 text-xs text-warm-700/60">
          <Link to="/chat" className="hover:text-warm-700">
            对话
          </Link>
          <Link to="/analysis" className="hover:text-warm-700">
            分析
          </Link>
          <Link to="/growth" className="hover:text-warm-700">
            成长
          </Link>
          <Link to="/settings" className="text-warm-700">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {status === 'loading' ? (
          <div className="mb-4 rounded-lg border border-warm-100 bg-white p-4 text-sm text-warm-700/70">
            加载中…
          </div>
        ) : null}

        {(error || localError) && status !== 'loading' ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {localError ?? error}
          </div>
        ) : null}

        {/* 记忆开关 */}
        <section className="mb-4 rounded-lg border border-warm-100 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-warm-700">长期记忆</h2>
              <p className="mt-1 text-xs text-warm-700/60">
                开启后,系统会记住你提到的关键事件与关系对象,以便后续对话更连贯。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={memoryEnabled}
              aria-label="长期记忆开关"
              onClick={() => void handleToggleMemory()}
              disabled={saving || status === 'loading'}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                memoryEnabled ? 'bg-warm-500' : 'bg-warm-200',
                saving ? 'opacity-60' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  memoryEnabled ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          {!memoryEnabled ? (
            <p
              className="mt-3 rounded-md bg-warm-50 px-3 py-2 text-xs text-warm-700/70"
              data-testid="memory-off-hint"
            >
              关闭后新对话不再记录长期记忆
            </p>
          ) : null}
        </section>

        {/* 语气偏好 */}
        <section className="rounded-lg border border-warm-100 bg-white p-5">
          <h2 className="text-sm font-medium text-warm-700">回复语气偏好</h2>
          <p className="mt-1 text-xs text-warm-700/60">
            选择你希望 AI 回复时倾向的语气风格。
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {TONE_OPTIONS.map((opt) => {
              const active = tonePreference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`tone-${opt.value}`}
                  aria-pressed={active}
                  onClick={() => void handleToneChange(opt.value)}
                  disabled={saving || status === 'loading'}
                  className={[
                    'rounded-lg border px-3 py-3 text-left transition',
                    active
                      ? 'border-warm-500 bg-warm-50'
                      : 'border-warm-100 bg-white hover:border-warm-300',
                  ].join(' ')}
                >
                  <div className="text-sm font-medium text-warm-700">
                    {opt.title}
                  </div>
                  <div className="mt-1 text-xs text-warm-700/60">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
