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
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const ensureSession = useSessionStore((s) => s.ensureSession);
  const newSession = useSessionStore((s) => s.newSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const selectSession = useSessionStore((s) => s.selectSession);

  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const reset = useChatStore((s) => s.reset);

  const [creating, setCreating] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (authStatus === 'authed') {
      void fetchSessions();
    }
  }, [authStatus, fetchSessions]);

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

  if (authStatus !== 'authed') {
    return (
      <div className="flex h-screen items-center justify-center text-warm-700/70">
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
      <div className="flex items-center justify-between border-b border-warm-100 px-4 py-3">
        <h2 className="text-sm font-medium text-warm-700">我的对话</h2>
        <button
          type="button"
          className="rounded-md bg-warm-500 px-2 py-1 text-xs text-white"
          onClick={handleNewSession}
        >
          新建
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <li
            key={s.id}
            className={[
              'group flex cursor-pointer items-center justify-between px-4 py-3 text-sm',
              s.id === currentSessionId
                ? 'bg-warm-50 text-warm-700'
                : 'text-warm-700/70 hover:bg-warm-50',
            ].join(' ')}
            onClick={() => void handleSelect(s.id)}
          >
            <span className="truncate">{truncate(s.title, 15)}</span>
            <button
              type="button"
              className="ml-2 hidden text-xs text-warm-700/40 group-hover:inline"
              onClick={(e) => {
                e.stopPropagation();
                void removeSession(s.id);
              }}
            >
              删除
            </button>
          </li>
        ))}
        {sessions.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-warm-700/40">
            还没有对话,点上方"新建"开始
          </li>
        ) : null}
      </ul>
    </>
  );

  const emptyState = (
    <div className="flex w-full max-w-md flex-col items-center px-6 text-center">
      <h2 className="text-base font-medium text-warm-700">今天想聊点什么?</h2>
      <p className="mt-2 text-xs text-warm-700/50">
        点下面的话题快速开始,也可以直接输入。
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            data-testid="quick-topic"
            className="rounded-xl border border-warm-100 bg-white px-4 py-3 text-left text-sm text-warm-700 shadow-sm hover:border-warm-500"
            onClick={() => handleQuickTopic(topic)}
          >
            {topic}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-screen w-full bg-warm-50">
      {/* 桌面端固定侧栏 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-warm-100 bg-white md:flex">
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
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-warm-100 bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      ) : null}

      {/* 主区 */}
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-warm-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="打开侧栏"
              className="rounded-md p-1 text-warm-700/70 hover:bg-warm-50 md:hidden"
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
            <h1 className="text-sm font-medium text-warm-700">
              {currentSession ? truncate(currentSession.title, 15) : '情感陪伴'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/analysis"
              className="text-xs text-warm-700/60 hover:text-warm-700"
            >
              关系分析
            </Link>
            <Link
              to="/recovery"
              className="text-xs text-warm-700/60 hover:text-warm-700"
            >
              恢复计划
            </Link>
            <Link
              to="/growth"
              className="text-xs text-warm-700/60 hover:text-warm-700"
            >
              成长
            </Link>
            <Link
              to="/settings"
              className="text-xs text-warm-700/60 hover:text-warm-700"
            >
              设置
            </Link>
            <button
              type="button"
              className="text-xs text-warm-700/60 md:hidden"
              onClick={handleNewSession}
            >
              + 新对话
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} emptyState={emptyState} />
        </div>
        {error ? (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
        <ChatInput
          value={inputValue}
          onValueChange={setInputValue}
          streaming={status === 'streaming'}
          onSend={(text) => void handleSend(text)}
          onAbort={abort}
        />
      </main>
    </div>
  );
}
