import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  event_name: z.string().trim().optional(),
  date_from: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  date_to: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

/**
 * GET /admin/analytics
 *
 * 埋点事件列表 + 各事件 COUNT 汇总。
 * 数据来源：analytics_events 表。
 */
export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/analytics',
    { preHandler: adminAuth },
    async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: parsed.error.message },
          timestamp: new Date().toISOString(),
        });
      }
      const { page, limit, event_name, date_from, date_to } = parsed.data;
      const offset = (page - 1) * limit;
      const pool = app.pool;

      const where: string[] = [];
      const params: unknown[] = [];

      if (event_name) {
        params.push(event_name);
        where.push(`event_name = $${params.length}`);
      }
      if (date_from) {
        params.push(date_from);
        where.push(`created_at >= $${params.length}::timestamptz`);
      }
      if (date_to) {
        params.push(date_to);
        where.push(`created_at <= $${params.length}::timestamptz`);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const [totalRes, listRes, summaryRes] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM analytics_events ${whereSql}`,
          params
        ),
        pool.query(
          `SELECT id, event_name, user_id, properties, created_at
             FROM analytics_events
             ${whereSql}
             ORDER BY created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        pool.query<{ event_name: string; count: string }>(
          `SELECT event_name, COUNT(*)::text AS count
             FROM analytics_events
             ${whereSql}
             GROUP BY event_name
             ORDER BY count DESC`,
          params
        ),
      ]);

      return reply.send({
        success: true,
        data: {
          events: listRes.rows,
          summary: Object.fromEntries(
            summaryRes.rows.map((r) => [r.event_name, Number(r.count)])
          ),
        },
        total: Number(totalRes.rows[0]?.count ?? '0'),
        page,
        timestamp: new Date().toISOString(),
      });
    }
  );
}
