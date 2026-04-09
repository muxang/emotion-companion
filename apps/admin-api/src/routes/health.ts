import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env.js';

/**
 * GET /admin/health
 *
 * 自身 DB 检查 + 可选转发 apps/api 的 health。
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const pool = app.pool;
    const env = loadEnv();

    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      dbStatus = 'error';
      app.log.warn({ err }, 'admin-health: database check failed');
    }

    let apiHealth: Record<string, unknown> | null = null;
    if (env.API_BASE_URL) {
      try {
        const res = await fetch(`${env.API_BASE_URL}/api/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        apiHealth = (await res.json()) as Record<string, unknown>;
      } catch {
        apiHealth = { status: 'unreachable' };
      }
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    return reply.code(status === 'ok' ? 200 : 503).send({
      success: true,
      data: {
        status,
        checks: { database: dbStatus },
        api_health: apiHealth,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
