import { create } from 'zustand';
import { streamChat } from '../api/stream.js';

export interface ChatViewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 流式中标记，true 时显示打字光标 */
  streaming?: boolean;
}

type ChatStatus = 'idle' | 'streaming' | 'error';

interface ChatState {
  messages: ChatViewMessage[];
  status: ChatStatus;
  error: string | null;
  abortController: AbortController | null;
  reset: (initial?: ChatViewMessage[]) => void;
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
  status: 'idle',
  error: null,
  abortController: null,

  reset(initial = []) {
    set({
      messages: initial,
      status: 'idle',
      error: null,
      abortController: null,
    });
  },

  async send(sessionId, content) {
    if (get().status === 'streaming') return;
    const userMsg: ChatViewMessage = {
      id: nextId(),
      role: 'user',
      content,
    };
    const assistantId = nextId();
    const assistantMsg: ChatViewMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
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
