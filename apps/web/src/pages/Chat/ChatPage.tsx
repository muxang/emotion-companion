import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useChatStore } from '../../stores/chatStore.js';
import { MessageList } from '../../components/chat/MessageList.js';
import { ChatInput } from '../../components/chat/ChatInput.js';

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
      // 刷新会话列表（更新 message_count 等）
      void fetchSessions();
    } finally {
      setCreating(false);
    }
  };

  const handleNewSession = async (): Promise<void> => {
    reset([]);
    await newSession();
  };

  const handleSelect = async (id: string): Promise<void> => {
    reset([]);
    await selectSession(id);
  };

  if (authStatus !== 'authed') {
    return (
      <div className="flex h-screen items-center justify-center text-warm-700/70">
        <div className="text-center">
          <p className="text-sm">{authStatus === 'error' ? `登录失败：${authError}` : '正在登录…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-warm-50">
      {/* 侧栏：会话列表 */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-warm-100 bg-white md:flex">
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
              <span className="truncate">{s.title}</span>
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
              还没有对话，点上方"新建"开始
            </li>
          ) : null}
        </ul>
      </aside>

      {/* 主区 */}
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-warm-100 bg-white px-4 py-3">
          <h1 className="text-sm font-medium text-warm-700">
            {currentSession?.title ?? '情感陪伴'}
          </h1>
          <button
            type="button"
            className="text-xs text-warm-700/60 md:hidden"
            onClick={handleNewSession}
          >
            + 新对话
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} />
        </div>
        {error ? (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}
        <ChatInput
          streaming={status === 'streaming'}
          onSend={(text) => void handleSend(text)}
          onAbort={abort}
        />
      </main>
    </div>
  );
}
