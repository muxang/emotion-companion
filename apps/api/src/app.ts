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
import type { OrchestratorMemoryDeps } from './orchestrator/types.js';
import { memoryRoutes } from './routes/memory.js';

export interface BuildAppOptions {
  repos: {
    users: UserRepository;
    sessions: SessionRepository;
    messages: MessageRepository;
    memory: MemoryRepository;
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

  return app;
}
