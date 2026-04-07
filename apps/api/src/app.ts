import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { AIClient } from '@emotion/core-ai';
import { loadEnv } from './config/env.js';
import jwtPlugin from './middleware/jwt.js';
import { registerErrorHandler } from './middleware/error.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
import { chatStreamRoutes } from './routes/chat-stream.js';
import { analysisRoutes } from './routes/analysis.js';
import type { UserRepository } from './db/repositories/users.js';
import type { SessionRepository } from './db/repositories/sessions.js';
import type { MessageRepository } from './db/repositories/messages.js';
import type { MemoryRepository } from './db/repositories/memory.js';
import type { RecoveryRepository } from './db/repositories/recovery.js';
import type { OrchestratorMemoryDeps } from './orchestrator/types.js';
import { memoryRoutes } from './routes/memory.js';
import { settingsRoutes } from './routes/settings.js';
import { recoveryRoutes } from './routes/recovery.js';

export interface BuildAppOptions {
  repos: {
    users: UserRepository;
    sessions: SessionRepository;
    messages: MessageRepository;
    memory: MemoryRepository;
    recovery: RecoveryRepository;
  };
  aiClient: AIClient;
  /** Phase 5：可选记忆依赖闭包（生产环境注入；测试可省略或注入 mock） */
  memoryDeps?: OrchestratorMemoryDeps;
}

/**
 * 构造可测试的 Fastify 实例。
 * 生产环境由 src/index.ts 注入真实 repositories；
 * 测试由 tests/* 注入 mock repositories。
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  registerErrorHandler(app);

  // 覆盖默认 JSON parser，允许空 body：
  // 浏览器 fetch + Content-Type: application/json 但不带 body 时，
  // Fastify 默认会抛 "Body cannot be empty when content-type is set to application/json"，
  // 这对 POST /api/memory/delete 这种"无 body 也合法"的接口不友好。
  // 把空 body 解析为 undefined，由各路由自己的 Zod 校验决定是否接受。
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const text = typeof body === 'string' ? body : '';
      if (text.trim().length === 0) {
        done(null, undefined);
        return;
      }
      try {
        const json: unknown = JSON.parse(text);
        done(null, json);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error, undefined);
      }
    }
  );

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: env.MAX_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
  });

  // 注入 repositories 与 AI client
  app.decorate('repos', options.repos);
  app.decorate('aiClient', options.aiClient);
  app.decorate('memoryDeps', options.memoryDeps);

  // JWT + requireAuth
  await app.register(jwtPlugin);

  // 路由
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(chatStreamRoutes, { prefix: '/api' });
  await app.register(analysisRoutes, { prefix: '/api' });
  await app.register(memoryRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(recoveryRoutes, { prefix: '/api' });

  return app;
}
