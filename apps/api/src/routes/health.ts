import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db/pool.js';
import { pingRedis, getRedisStatus } from '../redis/client.js';

/**
 * Phase 7：详细健康检查（CLAUDE.md §12.1）。
 *
 * 返回：
 * {
 *   status: 'ok' | 'degraded' | 'error',
 *   version: string,
 *   checks: { database, redis, uptime },
 *   timestamp
 * }
 *
 * - database：SELECT 1
 * - redis：PING，未配置时为 'disabled'（不降级 status）
 * - 任一检查为 error → 'degraded'
 */
const START_TIME = Date.now();

let cachedVersion: string | null = null;
function readVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    // dist/src/routes/health.js → 向上找 apps/api/package.json
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, '..', '..', 'package.json'),
      join(here, '..', '..', '..', 'package.json'),
      join(process.cwd(), 'package.json'),
    ];
    for (const p of candidates) {
      try {
        const text = readFileSync(p, 'utf-8');
        const pkg = JSON.parse(text) as { name?: string; version?: string };
        if (pkg.version && (pkg.name?.includes('api') ?? true)) {
          cachedVersion = pkg.version;
          return cachedVersion;
        }
      } catch {
        /* try next */
      }
    }
  } catch {
    /* ignore */
  }
  cachedVersion = '0.0.0';
  return cachedVersion;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    // 数据库 SELECT 1
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
    } catch (err) {
      dbStatus = 'error';
      app.log.warn({ err }, 'health: database check failed');
    }

    // Redis PING（未配置时为 disabled，不影响 status）
    let redisStatus = getRedisStatus();
    if (redisStatus !== 'disabled') {
      redisStatus = await pingRedis();
    }

    const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000);
    const degraded = dbStatus === 'error' || redisStatus === 'error';
    const status: 'ok' | 'degraded' | 'error' = degraded ? 'degraded' : 'ok';

    const body = {
      success: true,
      data: {
        status,
        version: readVersion(),
        checks: {
          database: dbStatus,
          redis: redisStatus,
          uptime: uptimeSec,
        },
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    // 降级状态返回 503 便于负载均衡识别
    return reply.code(status === 'ok' ? 200 : 503).send(body);
  });
}
