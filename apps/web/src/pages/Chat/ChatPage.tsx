import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageList } from '../../components/chat/MessageList.js';
import { ChatInput } from '../../components/chat/ChatInput.js';
import { truncate } from '../../utils/time.js';

/**
 * 空状态功能引导卡片：2x2 网格，让用户一眼看到可以做的四件事
 * + 各自的示例触发语句。点击 → 把 example 填入输入框 + 自动聚焦
 * （聚焦由 ChatInput 内部检测 value '' → 非空 边沿触发完成）。
 */
const FEATURE_HINTS: ReadonlyArray<{
  icon: string;
  title: string;
  desc: string;
  example: string;
}> = [
  {
    icon: '💬',
    title: '随时倾诉',
    desc: '直接说出你的困惑，我来接住',
    example: '他最近对我忽冷忽热...',
  },
  {
    icon: '🔍',
    title: '关系分析',
    desc: '告诉我情况，帮你看清',
    example: '帮我分析一下这段关系',
  },
  {
    icon: '📅',
    title: '恢复计划',
    desc: '7天或14天，陪你走出来',
    example: '我想开始一个恢复计划',
  },
  {
    icon: '✍️',
    title: '话术建议',
    desc: '不知道怎么说，我帮你写',
    example: '帮我写条消息给他',
  },
];

/**
 * 侧栏底部「功能速查」折叠面板里的关键词 → 功能映射，
 * 让用户记住"说什么会触发什么"。
 */
const SIDEBAR_HELP_TIPS: ReadonlyArray<{ trigger: string; result: string }> = [
  { trigger: '说"帮我分析"', result: '关系分析' },
  { trigger: '说"开始计划"', result: '恢复计划' },
  { trigger: '说"帮我写"', result: '话术建议' },
  { trigger: '说"今天打卡"', result: '记录进度' },
];

const HINT_BANNER_KEY = 'hint_dismissed';

export function ChatPage(): JSX.Element {
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);

  const sessions = useSessionStore((s) => s.sessions);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const currentMessages = useSessionStore((s) => s.currentMessages);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const ensureSession = useSessionStore((s) => s.ensureSession);
  const newSession = useSessionStore((s) => s.newSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const selectSession = useSessionStore((s) => s.selectSession);
  const renameSession = useSessionStore((s) => s.renameSession);

  const messages = useChatStore((s) => s.messages);
  const hydratedSessionId = useChatStore((s) => s.hydratedSessionId);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const thinkingMessage = useChatStore((s) => s.thinkingMessage);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const reset = useChatStore((s) => s.reset);
  const hydrateFromDb = useChatStore((s) => s.hydrateFromDb);

  const [creating, setCreating] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  // 侧栏底部"功能速查"折叠状态
  const [sidebarHelpOpen, setSidebarHelpOpen] = useState(false);
  // 首次使用引导提示条：依据 localStorage 决定是否显示
  // 初始 false，挂载后从 localStorage 读真实值，避免 SSR/首屏闪烁
  const [showHintBanner, setShowHintBanner] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_BANNER_KEY) !== '1') {
        setShowHintBanner(true);
      }
    } catch {
      // localStorage 不可用（隐私模式等）→ 默认不显示，不影响主流程
    }
  }, []);

  const dismissHintBanner = (): void => {
    setShowHintBanner(false);
    try {
      localStorage.setItem(HINT_BANNER_KEY, '1');
    } catch {
      /* 同上 */
    }
  };

  useEffect(() => {
    if (authStatus === 'authed') {
      void fetchSessions();
    }
  }, [authStatus, fetchSessions]);

  // 自动选第一个会话：当无 currentSessionId 但已有会话列表时（页面首次进入或会话被删后）
  useEffect(() => {
    if (authStatus !== 'authed') return;
    if (currentSessionId) return;
    if (sessions.length === 0) return;
    void selectSession(sessions[0]!.id);
  }, [authStatus, sessions, currentSessionId, selectSession]);

  // 当前会话被删除后 currentSessionId 变为 null，立即清空消息列表
  useEffect(() => {
    if (currentSessionId === null) {
      reset([]);
    }
  }, [currentSessionId, reset]);

  // 从 sessionStore.currentMessages（DB 载入）hydrate 到 chatStore，
  // 这样跨页面切换 / 切换会话回来时不会丢失历史消息。
  // 流式期间禁止覆盖（hydrateFromDb 内部已处理）。
  useEffect(() => {
    if (!currentSessionId) return;
    if (currentSessionId === hydratedSessionId) return;
    hydrateFromDb(currentSessionId, currentMessages);
  }, [currentSessionId, currentMessages, hydratedSessionId, hydrateFromDb]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const handleSend = async (text: string): Promise<void> => {
    if (creating) return;
    setCreating(true);
    try {
      const sid = await ensureSession();
      await send(sid, text);
      void fetchSessions();
    } finally {
      setCreating(false);
    }
  };

  const handleNewSession = async (): Promise<void> => {
    reset([]);
    await newSession();
    setSidebarOpen(false);
  };

  const handleSelect = async (id: string): Promise<void> => {
    reset([]);
    await selectSession(id);
    setSidebarOpen(false);
  };

  const handleFeatureHintClick = (example: string): void => {
    // 把示例填入输入框；ChatInput 内部会检测 '' → 非空 边沿，自动聚焦
    setInputValue(example);
  };

  const handleStartRename = (id: string, currentTitle: string): void => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
  };

  const handleCancelRename = (): void => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleCommitRename = async (id: string): Promise<void> => {
    const next = editingTitle.trim();
    if (next.length === 0 || next.length > 60) {
      handleCancelRename();
      return;
    }
    const original = sessions.find((s) => s.id === id)?.title;
    if (next === original) {
      handleCancelRename();
      return;
    }
    try {
      await renameSession(id, next);
    } catch {
      /* store 已回滚并设 error */
    } finally {
      handleCancelRename();
    }
  };

  if (authStatus !== 'authed') {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-400">
        <div className="text-center">
          <p className="text-sm">
            {authStatus === 'error' ? `登录失败:${authError}` : '正在登录…'}
          </p>
        </div>
      </div>
    );
  }

  const sidebar = (
    <>
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-[14px] font-medium text-neutral-800">我的对话</h2>
        <button
          type="button"
          className="rounded-md bg-primary-500 px-2 py-1 text-[14px] text-white hover:bg-primary-600"
          onClick={handleNewSession}
        >
          新建
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sessions.map((s) => {
          const isEditing = editingSessionId === s.id;
          return (
            <li
              key={s.id}
              className={[
                'group flex items-center justify-between gap-2 px-4 py-3 text-[14px] leading-snug',
                isEditing ? '' : 'cursor-pointer',
                s.id === currentSessionId
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-neutral-600 hover:bg-primary-50',
              ].join(' ')}
              onClick={() => {
                if (isEditing) return;
                void handleSelect(s.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleStartRename(s.id, s.title);
              }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={editingTitle}
                  maxLength={60}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCommitRename(s.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelRename();
                    }
                  }}
                  onBlur={() => void handleCommitRename(s.id)}
                  className="flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 outline-none focus:border-primary-400"
                  data-testid={`session-rename-input-${s.id}`}
                />
              ) : (
                <span className="flex-1 truncate" title={s.title}>
                  {truncate(s.title, 15)}
                </span>
              )}
              {!isEditing ? (
                <span className="hidden shrink-0 items-center gap-2 text-xs text-neutral-400 group-hover:inline-flex">
                  <button
                    type="button"
                    aria-label="重命名会话"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(s.id, s.title);
                    }}
                    className="hover:text-neutral-800"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    aria-label="删除会话"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSession(s.id);
                    }}
                    className="hover:text-rose-600"
                  >
                    删除
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
        {sessions.length === 0 ? (
          <li className="px-4 py-6 text-center text-[13px] text-neutral-400">
            还没有对话,点上方"新建"开始
          </li>
        ) : null}
      </ul>

      {/* 侧栏底部「功能速查」折叠面板：mt-auto 把它推到 sidebar 最底部 */}
      <div className="mt-auto border-t border-neutral-200 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => setSidebarHelpOpen((v) => !v)}
          className="text-[12px] text-neutral-400 hover:text-primary-500"
          data-testid="sidebar-help-toggle"
        >
          💡 功能速查
        </button>
        {sidebarHelpOpen ? (
          <div
            className="mt-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3 text-[12px] leading-loose text-neutral-400"
            data-testid="sidebar-help-list"
          >
            {SIDEBAR_HELP_TIPS.map((tip) => (
              <div key={tip.trigger}>
                {tip.trigger} → {tip.result}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  const emptyState = (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-medium text-neutral-800">今天想聊点什么?</h2>
      <p className="mt-2 text-[13px] text-neutral-400">
        直接告诉我你的情况,我来判断怎么帮你
      </p>

      {/* 2x2 功能引导卡片：让用户一眼看到可以做的四件事 */}
      <div
        className="mx-auto mb-4 mt-6 grid w-full max-w-lg grid-cols-2 gap-3"
        data-testid="feature-hints"
      >
        {FEATURE_HINTS.map((hint) => (
          <button
            key={hint.title}
            type="button"
            data-testid={`feature-hint-${hint.title}`}
            onClick={() => handleFeatureHintClick(hint.example)}
            className="cursor-pointer rounded-2xl border border-neutral-200 bg-white/60 p-3 text-left transition-all hover:border-primary-300 hover:bg-primary-50/50"
          >
            <div className="mb-1 text-xl">{hint.icon}</div>
            <div className="text-[13px] font-medium text-neutral-600">
              {hint.title}
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-neutral-500">
              {hint.desc}
            </div>
            <div className="mt-1.5 text-[11px] text-primary-500">
              示例：{hint.example}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-screen w-full bg-neutral-50">
      {/* 桌面端固定侧栏 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-100 md:flex">
        {sidebar}
      </aside>

      {/* 移动端抽屉侧栏 */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-neutral-200 bg-neutral-100 shadow-xl">
            {sidebar}
          </aside>
        </div>
      ) : null}

      {/* 主区 */}
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="打开侧栏"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-[15px] font-medium text-neutral-800">
              {currentSession ? truncate(currentSession.title, 15) : '情感陪伴'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/growth"
              className="text-[14px] text-neutral-400 hover:text-primary-600"
            >
              成长
            </Link>
            <Link
              to="/settings"
              className="text-[14px] text-neutral-400 hover:text-primary-600"
            >
              设置
            </Link>
            <button
              type="button"
              className="text-xs text-neutral-400 md:hidden"
              onClick={handleNewSession}
            >
              + 新对话
            </button>
          </div>
        </header>
        {/* 首次使用引导提示条：dismiss 后写 localStorage，永不再现 */}
        {showHintBanner ? (
          <div
            className="flex items-center justify-between border-b border-primary-100 bg-primary-50 px-4 py-2 text-[13px] text-primary-600"
            data-testid="first-use-hint-banner"
          >
            <span className="pr-3">
              💡 直接告诉我你的情况,我会自动判断怎么帮你—分析关系、制定计划、写消息都可以
            </span>
            <button
              type="button"
              onClick={dismissHintBanner}
              aria-label="关闭引导提示"
              className="shrink-0 cursor-pointer px-2 text-lg leading-none text-primary-400 hover:text-primary-600"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto">
          <MessageList
            messages={messages}
            emptyState={emptyState}
            thinkingMessage={thinkingMessage}
            onPlanOptionSelect={(text) => void handleSend(text)}
          />
        </div>
        {error ? (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
        {status === 'streaming' ? (
          <div
            className="border-t border-neutral-200 bg-neutral-50 px-4 py-1.5 text-center text-xs text-neutral-400"
            data-testid="chat-streaming-hint"
          >
            正在感受你的话,通常需要 5–10 秒…
          </div>
        ) : null}
        <ChatInput
          value={inputValue}
          onValueChange={setInputValue}
          streaming={status === 'streaming'}
          thinking={thinkingMessage !== null}
          onSend={(text) => void handleSend(text)}
          onAbort={abort}
        />
      </main>
    </div>
  );
}
