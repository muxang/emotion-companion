import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ChatMessageSchema } from '@emotion/shared';
import { newRequestId } from '../utils/request-id.js';
import { loadEnv } from '../config/env.js';

/**
 * 解析 CORS_ORIGIN（可能是 "a,b,c"），根据请求 Origin 选择要回写的值。
 * 命中白名单则回写匹配项；否则回写白名单第一项作为兜底。
 * 注意：credentials=true 时禁止使用 "*"，必须回写具体源。
 */
function pickAllowedOrigin(
  requestOrigin: string | undefined,
  configured: string
): string {
  const list = configured
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) return '';
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0] ?? '';
}

/** mock 流回复内容（Phase 2 替换为真实 AI） */
const MOCK_REPLY = '我听到你了。慢慢来，我们一步一步说，今天先告诉我发生了什么。';
const CHAR_DELAY_MS = 100;
const KEEPALIVE_MS = 15_000;

/**
 * 把字符切成 SSE chunk 异步生成器。
 * 抽出来便于在 Phase 1 单元测试中独立测试。
 */
export async function* mockStreamGenerator(
  text: string,
  delayMs: number,
  signal: AbortSignal
): AsyncGenerator<string> {
  for (const ch of text) {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    if (signal.aborted) return;
    yield ch;
  }
}

export function buildSseChunk(type: 'delta' | 'done' | 'error', payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

/**
 * POST /api/chat/stream
 * - Bearer 鉴权
 * - body: { session_id, content, context? }
 * - SSE 输出（CLAUDE.md §12.3）
 * - Phase 1：mock 流，不写库
 */
export async function chatStreamRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/chat/stream',
    { preHandler: [app.requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      if (!userId) {
        return reply
          .code(401)
          .send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: '未登录' },
            timestamp: new Date().toISOString(),
          });
      }

      const parsed = ChatMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求体校验失败',
            details: { issues: parsed.error.issues },
          },
          timestamp: new Date().toISOString(),
        });
      }

      // 校验会话归属
      const session = await app.repos.sessions.findById(parsed.data.session_id);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '会话不存在' },
          timestamp: new Date().toISOString(),
        });
      }
      if (session.user_id !== userId) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: '无权访问该会话' },
          timestamp: new Date().toISOString(),
        });
      }

      const requestId = newRequestId();
      request.log.info(
        { requestId, sessionId: session.id, userId },
        'chat/stream begin (mock, Phase 1)'
      );

      // 接管底层响应
      // 注意：reply.hijack() 之后 Fastify 的生命周期 hook（含 @fastify/cors 的 onSend）
      // 不再触发，必须在 writeHead 时手动写入 CORS 响应头，否则浏览器会拒收 SSE 流。
      reply.hijack();
      const raw = reply.raw;
      const env = loadEnv();
      const allowedOrigin = pickAllowedOrigin(
        request.headers.origin,
        env.CORS_ORIGIN
      );
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        // Origin 不同会影响响应头，需要 Vary 防止 CDN/浏览器错缓存
        Vary: 'Origin',
      });

      const ac = new AbortController();
      let totalChars = 0;
      let finished = false;

      const cleanup = (): void => {
        if (finished) return;
        finished = true;
        clearInterval(keepalive);
        ac.abort();
      };

      // 客户端中止/断连
      request.raw.on('close', () => {
        if (!raw.writableEnded) {
          request.log.info({ requestId }, 'chat/stream client closed');
        }
        cleanup();
      });

      // keepalive ping
      const keepalive = setInterval(() => {
        if (raw.writableEnded) {
          clearInterval(keepalive);
          return;
        }
        try {
          raw.write(`: ping\n\n`);
        } catch {
          cleanup();
        }
      }, KEEPALIVE_MS);

      try {
        for await (const ch of mockStreamGenerator(
          MOCK_REPLY,
          CHAR_DELAY_MS,
          ac.signal
        )) {
          if (raw.writableEnded) break;
          raw.write(buildSseChunk('delta', { content: ch }));
          totalChars++;
        }

        if (!raw.writableEnded && !ac.signal.aborted) {
          raw.write(
            buildSseChunk('done', {
              metadata: { request_id: requestId, total_chars: totalChars },
            })
          );
        }
      } catch (err) {
        request.log.error({ err, requestId }, 'chat/stream error');
        if (!raw.writableEnded) {
          raw.write(
            buildSseChunk('error', {
              code: 'STREAM_ERROR',
              message: (err as Error).message,
            })
          );
        }
      } finally {
        cleanup();
        if (!raw.writableEnded) {
          raw.end();
        }
      }
    }
  );
}
