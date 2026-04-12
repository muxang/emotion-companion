import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  mode: z.enum(['companion', 'analysis', 'coach', 'recovery', 'safety']).optional(),
  date_from: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  date_to: z.string().datetime({ offset: true }).optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/conversations',
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
      const { page, limit, risk_level, mode, date_from, date_to } = parsed.data;
      const offset = (page - 1) * limit;
      const pool = app.pool;

      const where: string[] = [];
      const params: unknown[] = [];

      if (risk_level) {
        params.push(risk_level);
        where.push(`m.risk_level = $${params.length}`);
      }
      if (mode) {
        params.push(mode);
        where.push(`m.intake_result->>'next_mode' = $${params.length}`);
      }
      if (date_from) {
        params.push(date_from);
        where.push(`m.created_at >= $${params.length}::timestamptz`);
      }
      if (date_to) {
        params.push(date_to);
        where.push(`m.created_at <= $${params.length}::timestamptz`);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const totalRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM messages m
           JOIN sessions s ON s.id = m.session_id
           ${whereSql}`,
        params
      );

      params.push(limit);
      params.push(offset);

      const listRes = await pool.query(
        `SELECT m.id, m.role, m.content, m.risk_level, m.intake_result,
                m.structured_json, m.created_at, m.session_id,
                s.user_id, u.anonymous_id
           FROM messages m
           JOIN sessions s ON s.id = m.session_id
           JOIN users u ON u.id = s.user_id
           ${whereSql}
           ORDER BY m.created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
