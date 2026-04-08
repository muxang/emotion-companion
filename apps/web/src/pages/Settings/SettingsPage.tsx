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
        <h1 className="text-[15px] font-semibold text-neutral-800">设置</h1>
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
          <Link to="/growth" className="hover:text-primary-600">
            成长
          </Link>
          <Link to="/settings" className="text-primary-600">
            设置
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {status === 'loading' ? (
          <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-400">
            加载中…
          </div>
        ) : null}

        {(error || localError) && status !== 'loading' ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {localError ?? error}
          </div>
        ) : null}

        {/* 记忆开关 */}
        <section className="mb-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-medium text-neutral-800">长期记忆</h2>
              <p className="mt-1 text-[14px] text-neutral-400">
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
                memoryEnabled ? 'bg-primary-500' : 'bg-neutral-200',
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
              className="mt-3 rounded-md bg-primary-50 px-3 py-2 text-[13px] text-neutral-400"
              data-testid="memory-off-hint"
            >
              关闭后新对话不再记录长期记忆
            </p>
          ) : null}
        </section>

        {/* 语气偏好 */}
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-[16px] font-medium text-neutral-800">回复语气偏好</h2>
          <p className="mt-1 text-[14px] text-neutral-400">
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
                      ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-400/30'
                      : 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50',
                  ].join(' ')}
                >
                  <div className="text-[14px] font-medium text-neutral-800">
                    {opt.title}
                  </div>
                  <div className="mt-1 text-[13px] text-neutral-400">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
