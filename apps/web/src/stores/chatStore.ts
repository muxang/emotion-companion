import { create } from 'zustand';
import type { MessageDTO } from '@emotion/shared';
import { streamChat } from '../api/stream.js';

export type ActionCardType =
  | 'analysis_result'
  | 'plan_created'
  | 'checkin_done'
  | 'plan_options'
  | 'coach_result';

export interface ActionCard {
  id: string;
  action_type: ActionCardType;
  payload: unknown;
  createdAt: string;
  /**
   * 仅 plan_options 卡片使用：true 表示这条消息是会话的最后一条
   * （用户尚未做出选择），渲染按钮；false 表示用户已选过，渲染只读状态。
   * 由 hydrateFromDb 在装载历史时根据消息位置写入。
   */
  isLastMessage?: boolean;
}

export interface ChatViewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 消息创建时间（ISO 字符串），用于显示时间戳 */
  createdAt: string;
  /** 流式中标记，true 时显示打字光标 */
  streaming?: boolean;
  /** 智能融合：附加在该消息下方的富文本卡片（分析结果、计划确认等） */
  actionCard?: ActionCard;
}

type ChatStatus = 'idle' | 'streaming' | 'error';

interface ChatState {
  messages: ChatViewMessage[];
  /** 当前已经加载到内存的会话 id；用于避免重复 hydrate */
  hydratedSessionId: string | null;
  status: ChatStatus;
  error: string | null;
  abortController: AbortController | null;
  /**
   * AI 处理中的进度提示文字（如"正在理解你说的话..."）。
   * 非 null 时显示思考气泡；收到第一个 delta 后清为 null。
   */
  thinkingMessage: string | null;
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
  thinkingMessage: null,

  reset(initial = []) {
    set({
      messages: initial,
      hydratedSessionId: null,
      status: 'idle',
      error: null,
      abortController: null,
      thinkingMessage: null,
    });
  },

  hydrateFromDb(sessionId, dtos) {
    // 流式期间禁止覆盖（避免把正在显示的 streaming 占位消息抹掉）
    if (get().status === 'streaming') return;
    const filtered = dtos.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );
    const lastIndex = filtered.length - 1;
    const messages: ChatViewMessage[] = filtered.map((m, i) => {
      const view: ChatViewMessage = {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.created_at,
      };
      // 重建 actionCard：assistant 消息的 structured_json 里若有 _actionCard
      // 字段，恢复成内存中的 ActionCard 对象，让历史卡片刷新后仍然显示
      if (m.role === 'assistant' && m.structured_json) {
        const raw = (m.structured_json as Record<string, unknown>)._actionCard;
        if (raw && typeof raw === 'object') {
          const ac = raw as { action_type?: string; payload?: unknown };
          if (ac.action_type) {
            view.actionCard = {
              id: m.id,
              action_type: ac.action_type as ActionCardType,
              payload: ac.payload,
              createdAt: m.created_at,
              // plan_options 仅当这条是最后一条消息时才允许选择
              isLastMessage: i === lastIndex,
            };
          }
        }
      }
      return view;
    });
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
      thinkingMessage: null,
    });

    const ac = new AbortController();
    set({ abortController: ac });

    await streamChat({
      sessionId,
      content,
      signal: ac.signal,
      onThinking: (message) => {
        set({ thinkingMessage: message });
      },
      onAction: (actionType, payload) => {
        const card: ActionCard = {
          id: nextId(),
          action_type: actionType as ActionCardType,
          payload,
          createdAt: new Date().toISOString(),
        };
        set({
          messages: get().messages.map((m) =>
            m.id === assistantId ? { ...m, actionCard: card } : m
          ),
        });
      },
      onDelta: (text) => {
        set({
          thinkingMessage: null,
          messages: get().messages.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + text }
              : m
          ),
        });
      },
      onDone: () => {
        set({
          thinkingMessage: null,
          messages: get().messages.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          ),
          status: 'idle',
          abortController: null,
        });
      },
      onError: (_code, message) => {
        set({
          thinkingMessage: null,
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
        thinkingMessage: null,
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
