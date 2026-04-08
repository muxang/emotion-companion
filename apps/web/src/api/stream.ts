import { fetchEventSource } from '@microsoft/fetch-event-source';
import { buildUrl, getToken } from './client.js';

export interface StreamChatParams {
  sessionId: string;
  content: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onDone: (metadata: Record<string, unknown>) => void;
  onError: (code: string, message: string) => void;
  onThinking?: (message: string) => void;
  onAction?: (actionType: string, payload: unknown) => void;
}

interface ServerEvent {
  type: 'delta' | 'done' | 'error' | 'thinking' | 'action';
  content?: string;
  metadata?: Record<string, unknown>;
  code?: string;
  message?: string;
  action_type?: string;
  payload?: unknown;
}

class FatalStreamError extends Error {}

/**
 * 通过 SSE 调用 POST /api/chat/stream。
 * 必须使用 @microsoft/fetch-event-source（CLAUDE.md §12.3，原生 EventSource 不支持 POST + Bearer）。
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const token = getToken();
  await fetchEventSource(buildUrl('/api/chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      content: params.content,
    }),
    signal: params.signal,
    openWhenHidden: true,

    async onopen(res) {
      if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) {
        return;
      }
      // 非 SSE：可能是错误响应
      let code = 'STREAM_OPEN_FAILED';
      let message = `HTTP ${res.status}`;
      try {
        const json = (await res.json()) as {
          success: boolean;
          error?: { code: string; message: string };
        };
        if (json.error) {
          code = json.error.code;
          message = json.error.message;
        }
      } catch {
        /* ignore parse error */
      }
      params.onError(code, message);
      throw new FatalStreamError(message);
    },

    onmessage(ev) {
      if (!ev.data) return;
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(ev.data) as ServerEvent;
      } catch {
        return;
      }
      switch (parsed.type) {
        case 'thinking':
          if (parsed.message) params.onThinking?.(parsed.message);
          break;
        case 'action':
          if (parsed.action_type) {
            params.onAction?.(parsed.action_type, parsed.payload);
          }
          break;
        case 'delta':
          if (parsed.content) params.onDelta(parsed.content);
          break;
        case 'done':
          params.onDone(parsed.metadata ?? {});
          break;
        case 'error':
          params.onError(
            parsed.code ?? 'STREAM_ERROR',
            parsed.message ?? '流式响应错误'
          );
          break;
      }
    },

    onerror(err) {
      // 抛出后 fetch-event-source 不再重试
      throw err;
    },
  }).catch((err: unknown) => {
    if (params.signal.aborted) return; // 主动中止不算错误
    if (err instanceof FatalStreamError) return; // 已通过 onError 通知
    params.onError(
      'STREAM_ERROR',
      err instanceof Error ? err.message : '流式连接异常'
    );
  });
}
