import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  level: z.enum(['high', 'critical']).optional(),
});

/**
 * GET /admin/safety
 *
 * 安全事件列表。当前项目无独立 risk_logs 表，
 * 从 messages.risk_level='high'|'critical' 的消息派生。
 */
export async function safetyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/safety',
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
      const { page, limit, level } = parsed.data;
      const offset = (page - 1) * limit;
      const pool = app.pool;

      const riskLevels = level ? [level] : ['high', 'critical'];
      const params: unknown[] = [riskLevels];

      const whereSql = 'WHERE m.risk_level = ANY($1)';

      const totalRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM messages m
           ${whereSql}`,
        params
      );

      params.push(limit);
      params.push(offset);

      const listRes = await pool.query(
        `SELECT
            m.id,
            u.anonymous_id AS user_anonymous_id,
            m.session_id,
            m.risk_level,
            m.intake_result->>'reasoning' AS trigger_reason,
            m.intake_result->>'next_mode' AS action_taken,
            m.created_at
          FROM messages m
          JOIN sessions s ON s.id = m.session_id
          JOIN users u ON u.id = s.user_id
          ${whereSql}
          ORDER BY m.created_at DESC
          LIMIT $2 OFFSET $3`,
        params
      );

      return reply.send({
        success: true,
        data: listRes.rows,
        total: Number(totalRes.rows[0]?.count ?? '0'),
        page,
        timestamp: new Date().toISOString(),
      });
    }
  );
}
