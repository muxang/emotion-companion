import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageList } from '../../components/chat/MessageList.js';
import { ChatInput } from '../../components/chat/ChatInput.js';
import { truncate } from '../../utils/time.js';

const QUICK_TOPICS: string[] = [
  '我最近感情上有些困惑…',
  '想让你帮我分析一下这段关系',
  '我有点低落,想找人说说话',
];

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

  const handleQuickTopic = (topic: string): void => {
    setInputValue(topic);
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
        <h2 className="text-sm font-medium text-neutral-800">我的对话</h2>
        <button
          type="button"
          className="rounded-md bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600"
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
                'group flex items-center justify-between gap-2 px-4 py-3 text-sm',
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
          <li className="px-4 py-6 text-center text-xs text-neutral-400">
            还没有对话,点上方"新建"开始
          </li>
        ) : null}
      </ul>
    </>
  );

  const emptyState = (
    <div className="flex w-full max-w-md flex-col items-center px-6 text-center">
      <h2 className="text-base font-medium text-neutral-800">今天想聊点什么?</h2>
      <p className="mt-2 text-xs text-neutral-400">
        点下面的话题快速开始,也可以直接输入。
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            data-testid="quick-topic"
            className="rounded-xl border border-primary-200 bg-white px-4 py-3 text-left text-sm text-primary-600 shadow-sm hover:bg-primary-50"
            onClick={() => handleQuickTopic(topic)}
          >
            {topic}
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
            <h1 className="text-sm font-medium text-neutral-800">
              {currentSession ? truncate(currentSession.title, 15) : '情感陪伴'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/analysis"
              className="text-xs text-neutral-400 hover:text-primary-600"
            >
              关系分析
            </Link>
            <Link
              to="/recovery"
              className="text-xs text-neutral-400 hover:text-primary-600"
            >
              恢复计划
            </Link>
            <Link
              to="/growth"
              className="text-xs text-neutral-400 hover:text-primary-600"
            >
              成长
            </Link>
            <Link
              to="/settings"
              className="text-xs text-neutral-400 hover:text-primary-600"
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
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} emptyState={emptyState} thinkingMessage={thinkingMessage} />
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
