import { create } from 'zustand';
import type { MessageDTO } from '@emotion/shared';
import { streamChat } from '../api/stream.js';

export interface ChatViewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 消息创建时间（ISO 字符串），用于显示时间戳 */
  createdAt: string;
  /** 流式中标记，true 时显示打字光标 */
  streaming?: boolean;
}

type ChatStatus = 'idle' | 'streaming' | 'error';

interface ChatState {
  messages: ChatViewMessage[];
  /** 当前已经加载到内存的会话 id；用于避免重复 hydrate */
  hydratedSessionId: string | null;
  status: ChatStatus;
  error: string | null;
  abortController: AbortController | null;
  reset: (initial?: ChatViewMessage[]) => void;
  /**
   * 把 DB 拉到的 MessageDTO[] 装载为视图消息。
   * - 仅 user / assistant 角色（system 跳过）
   * - 流式期间不会被覆盖（status === 'streaming' 时静默忽略）
   * - 用 sessionId 标记已 hydrate，避免重复执行
   */
  hydrateFromDb: (sessionId: string, dtos: MessageDTO[]) => void;
  send: (sessionId: string, content: string) => Promise<void>;
  abort: () => void;
}

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `local-${Date.now()}-${messageCounter}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  hydratedSessionId: null,
  status: 'idle',
  error: null,
  abortController: null,

  reset(initial = []) {
    set({
      messages: initial,
      hydratedSessionId: null,
      status: 'idle',
      error: null,
      abortController: null,
    });
  },

  hydrateFromDb(sessionId, dtos) {
    // 流式期间禁止覆盖（避免把正在显示的 streaming 占位消息抹掉）
    if (get().status === 'streaming') return;
    const messages: ChatViewMessage[] = dtos
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.created_at,
      }));
    set({
      messages,
      hydratedSessionId: sessionId,
      status: 'idle',
      error: null,
      abortController: null,
    });
  },

  async send(sessionId, content) {
    if (get().status === 'streaming') return;
    const now = new Date().toISOString();
    const userMsg: ChatViewMessage = {
      id: nextId(),
      role: 'user',
      content,
      createdAt: now,
    };
    const assistantId = nextId();
    const assistantMsg: ChatViewMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    set({
      messages: [...get().messages, userMsg, assistantMsg],
      status: 'streaming',
      error: null,
    });

    const ac = new AbortController();
    set({ abortController: ac });

    await streamChat({
      sessionId,
      content,
      signal: ac.signal,
      onDelta: (text) => {
        set({
          messages: get().messages.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + text }
              : m
          ),
        });
      },
      onDone: () => {
        set({
          messages: get().messages.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          ),
          status: 'idle',
          abortController: null,
        });
      },
      onError: (_code, message) => {
        set({
          messages: get().messages.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          ),
          status: 'error',
          error: message,
          abortController: null,
        });
      },
    });

    if (ac.signal.aborted) {
      set({
        messages: get().messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ),
        status: 'idle',
        abortController: null,
      });
    }
  },

  abort() {
    const ac = get().abortController;
    if (ac) ac.abort();
  },
}));
