import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ChatMessageSchema } from '@emotion/shared';
import { newRequestId } from '../utils/request-id.js';
import { loadEnv } from '../config/env.js';
import { orchestrate } from '../orchestrator/index.js';

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

const KEEPALIVE_MS = 15_000;

const DEFAULT_SESSION_TITLE = '新对话';
const AUTO_TITLE_MAX_CHARS = 15;

/**
 * 从首条用户消息生成会话标题：
 * - 去掉换行/多余空白
 * - 截取前 15 个字符
 * - 太短或为空则返回 '新对话'
 */
function makeAutoTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return DEFAULT_SESSION_TITLE;
  if (cleaned.length <= AUTO_TITLE_MAX_CHARS) return cleaned;
  return cleaned.slice(0, AUTO_TITLE_MAX_CHARS) + '…';
}

/**
 * 清除字符串中的 lone surrogate（半个 surrogate pair）。
 * Node.js 20+ 的 JSON.stringify 对 lone surrogate 会抛 TypeError；
 * 这里把它替换为空字符串，避免 SSE 流中断。
 * 正常情况下不应出现（replayChunks 已按码点切），这是最后一道防线。
 */
function sanitizeString(s: string): string {
  // lone high surrogate: \uD800-\uDBFF 不紧跟 low surrogate
  // lone low surrogate:  \uDC00-\uDFFF 不紧跟 high surrogate
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

export function buildSseChunk(
  type: 'delta' | 'done' | 'error' | 'meta' | 'thinking' | 'action',
  payload: Record<string, unknown>
): string {
  const safe: Record<string, unknown> = { type };
  for (const [k, v] of Object.entries(payload)) {
    safe[k] = typeof v === 'string' ? sanitizeString(v) : v;
  }
  return `data: ${JSON.stringify(safe)}\n\n`;
}

/**
 * POST /api/chat/stream
 * - Bearer 鉴权
 * - body: { session_id, content, context? }
 * - SSE 输出（CLAUDE.md §12.3）
 * - Phase 2：调用 orchestrator → 真实 AI / safety / placeholder
 */
export async function chatStreamRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/chat/stream',
    {
      preHandler: [app.requireAuth],
      // Phase 7：单路由严格限流（20 次/分钟）
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({
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

      // Phase 5：拉用户记录，拿到 memory_enabled 开关供 orchestrator Step 5 / 异步任务用
      const userRecord = await app.repos.users.findById(userId);

      // Phase 7：首条消息自动起标题（默认还是 '新对话' 且 message_count === 0）
      // 静默失败，不阻塞主流程
      if (session.title === DEFAULT_SESSION_TITLE && session.message_count === 0) {
        const autoTitle = makeAutoTitle(parsed.data.content);
        if (autoTitle && autoTitle !== DEFAULT_SESSION_TITLE) {
          try {
            await app.repos.sessions.updateTitle(session.id, userId, autoTitle);
          } catch (err) {
            request.log.warn({ err, sessionId: session.id }, 'auto-title failed');
          }
        }
      }

      const requestId = newRequestId();
      const env = loadEnv();
      request.log.info(
        { requestId, sessionId: session.id, userId },
        'chat/stream begin (orchestrator, Phase 2)'
      );

      // Phase 7：用户消息埋点（只记长度，不记原文）
      app.tracker.track(
        'chat_message_sent',
        {
          session_id: session.id,
          content_length: parsed.data.content.length,
          request_id: requestId,
        },
        userId
      );

      // ---- 接管底层响应 ----
      reply.hijack();
      const raw = reply.raw;
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
        Vary: 'Origin',
      });

      // 立即推送思考状态，让用户看到 AI 正在处理而非空白等待
      raw.write(buildSseChunk('thinking', { message: '正在理解你说的话...' }));

      const ac = new AbortController();
      let finished = false;

      const cleanup = (): void => {
        if (finished) return;
        finished = true;
        clearInterval(keepalive);
        ac.abort();
      };

      request.raw.on('close', () => {
        if (!raw.writableEnded) {
          request.log.info({ requestId }, 'chat/stream client closed');
        }
        cleanup();
      });

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
        const events = orchestrate(
          {
            user_id: userId,
            session_id: session.id,
            user_text: parsed.data.content,
          },
          {
            ai: app.aiClient,
            repos: {
              sessions: app.repos.sessions,
              messages: app.repos.messages,
              recovery: app.repos.recovery,
            },
            signal: ac.signal,
            logger: request.log,
            intakeTimeoutMs: env.INTAKE_TIMEOUT_MS,
            skillTimeoutMs: env.SKILL_TIMEOUT_MS,
            requestId,
            ...(userRecord
              ? {
                  user: {
                    id: userRecord.id,
                    memory_enabled: userRecord.memory_enabled,
                  },
                }
              : {}),
            ...(app.memoryDeps ? { memory: app.memoryDeps } : {}),
            tracker: app.tracker,
          }
        );

        for await (const ev of events) {
          if (raw.writableEnded) break;
          raw.write(buildSseChunk(ev.type, ev as unknown as Record<string, unknown>));
        }
      } catch (err) {
        request.log.error({ err, requestId }, 'chat/stream orchestrator error');
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
