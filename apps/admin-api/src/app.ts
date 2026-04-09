import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { loadEnv } from './config/env.js';
import { overviewRoutes } from './routes/overview.js';
import { userRoutes } from './routes/users.js';
import { conversationRoutes } from './routes/conversations.js';
import { safetyRoutes } from './routes/safety.js';
import { recoveryRoutes } from './routes/recovery.js';
import { analyticsRoutes } from './routes/analytics.js';
import { healthRoutes } from './routes/health.js';

export interface BuildAdminAppOptions {
  pool: Pool;
}

export async function buildAdminApp(
  options: BuildAdminAppOptions
): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  await app.register(cors, {
    origin: env.ADMIN_CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.decorate('pool', options.pool);

  // 路由
  await app.register(healthRoutes, { prefix: '/admin' });
  await app.register(overviewRoutes, { prefix: '/admin' });
  await app.register(userRoutes, { prefix: '/admin' });
  await app.register(conversationRoutes, { prefix: '/admin' });
  await app.register(safetyRoutes, { prefix: '/admin' });
  await app.register(recoveryRoutes, { prefix: '/admin' });
  await app.register(analyticsRoutes, { prefix: '/admin' });

  return app;
}
