import { AIClient } from '@emotion/core-ai';
import { createTracker } from '@emotion/analytics';
import {
  extractAndSaveEntities,
  formatMemoryContext,
  generateSessionSummary,
  getUserMemory,
} from '@emotion/memory';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { getPool, closePool } from './db/pool.js';
import { closeRedis } from './redis/client.js';
import { registerGracefulShutdown } from './utils/graceful-shutdown.js';
import { createUserRepository } from './db/repositories/users.js';
import { createSessionRepository } from './db/repositories/sessions.js';
import { createMessageRepository } from './db/repositories/messages.js';
import { createMemoryRepository } from './db/repositories/memory.js';
import { createRecoveryRepository } from './db/repositories/recovery.js';
import type { OrchestratorMemoryDeps } from './orchestrator/types.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const pool = getPool();

  const aiClient = new AIClient({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL,
    defaultMaxTokens: env.AI_MAX_TOKENS,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  });

  // Phase 5：记忆依赖闭包（packages/memory 直接持有 pool + ai）
  const memoryDeps: OrchestratorMemoryDeps = {
    getUserMemory: (userId, memoryEnabled) =>
      getUserMemory(pool, userId, memoryEnabled),
    generateSessionSummary: (sessionId, userId, memoryEnabled) =>
      generateSessionSummary({ pool, ai: aiClient }, sessionId, userId, memoryEnabled),
    extractAndSaveEntities: (sessionId, userId, memoryEnabled) =>
      extractAndSaveEntities({ pool, ai: aiClient }, sessionId, userId, memoryEnabled),
    formatMemoryContext,
  };

  const tracker = createTracker(pool);

  const app = await buildApp({
    repos: {
      users: createUserRepository(pool),
      sessions: createSessionRepository(pool),
      messages: createMessageRepository(pool),
      memory: createMemoryRepository(pool),
      recovery: createRecoveryRepository(pool),
    },
    aiClient,
    memoryDeps,
    tracker,
  });

  registerGracefulShutdown(app, {
    closePool,
    closeRedis,
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `emotion-companion api listening on http://${env.HOST}:${env.PORT}`
    );
  } catch (err) {
    app.log.error(err);
    await closePool();
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
