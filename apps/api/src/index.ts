import { AIClient } from '@emotion/core-ai';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { getPool, closePool } from './db/pool.js';
import { createUserRepository } from './db/repositories/users.js';
import { createSessionRepository } from './db/repositories/sessions.js';
import { createMessageRepository } from './db/repositories/messages.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const pool = getPool();

  const aiClient = new AIClient({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL,
    defaultMaxTokens: env.AI_MAX_TOKENS,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  });

  const app = await buildApp({
    repos: {
      users: createUserRepository(pool),
      sessions: createSessionRepository(pool),
      messages: createMessageRepository(pool),
    },
    aiClient,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closePool();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

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
