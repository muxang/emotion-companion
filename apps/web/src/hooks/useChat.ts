import { useChatStore } from '../stores/chatStore.js';

/**
 * 流式对话 Hook。状态来自 chatStore，组件直接订阅细粒度字段以减少重渲染。
 */
export function useChat(): {
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  status: ReturnType<typeof useChatStore.getState>['status'];
  error: string | null;
  send: (sessionId: string, content: string) => Promise<void>;
  abort: () => void;
  reset: ReturnType<typeof useChatStore.getState>['reset'];
} {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const reset = useChatStore((s) => s.reset);

  return { messages, status, error, send, abort, reset };
}
