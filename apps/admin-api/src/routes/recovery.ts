import type { FastifyInstance } from 'fastify';
import { adminAuth } from '../middleware/auth.js';

/**
 * GET /admin/recovery/stats
 *
 * 恢复计划汇总统计。
 */
export async function recoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/recovery/stats',
    { preHandler: adminAuth },
    async (_request, reply) => {
      const pool = app.pool;

      const [
        totalRes,
        activeRes,
        completedRes,
        avgDaysRes,
        typeDistRes,
        checkinRes,
      ] = await Promise.all([
        pool.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM recovery_plans'
        ),
        pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM recovery_plans WHERE status = 'active'"
        ),
        pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM recovery_plans WHERE status = 'completed'"
        ),
        pool.query<{ avg: string | null }>(
          `SELECT AVG(current_day)::text AS avg
             FROM recovery_plans
            WHERE status IN ('active', 'completed')`
        ),
        pool.query<{ plan_type: string; count: string }>(
          `SELECT plan_type, COUNT(*)::text AS count
             FROM recovery_plans
            GROUP BY plan_type`
        ),
        pool.query<{ date: string; rate: string }>(
          `WITH days AS (
              SELECT generate_series(
                (CURRENT_DATE - INTERVAL '13 days')::date,
                CURRENT_DATE::date,
                INTERVAL '1 day'
              )::date AS date
            )
            SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
                   COALESCE(
                     ROUND(
                       SUM(CASE WHEN rc.completed THEN 1 ELSE 0 END)::numeric
                       / NULLIF(COUNT(rc.id), 0)
                       * 100, 1
                     ), 0
                   )::text AS rate
              FROM days d
              LEFT JOIN recovery_checkins rc ON DATE(rc.created_at) = d.date
             GROUP BY d.date
             ORDER BY d.date`
        ),
      ]);

      const totalPlans = Number(totalRes.rows[0]?.count ?? '0');
      const completedPlans = Number(completedRes.rows[0]?.count ?? '0');

      const planTypeDist: Record<string, number> = {};
      for (const r of typeDistRes.rows) {
        planTypeDist[r.plan_type] = Number(r.count);
      }

      return reply.send({
        success: true,
        data: {
          total_plans: totalPlans,
          active_plans: Number(activeRes.rows[0]?.count ?? '0'),
          completed_plans: completedPlans,
          completion_rate:
            totalPlans > 0
              ? Math.round((completedPlans / totalPlans) * 10000) / 100
              : 0,
          avg_days_completed: Number(avgDaysRes.rows[0]?.avg ?? '0'),
          plan_type_distribution: planTypeDist,
          daily_checkin_rate: checkinRes.rows.map((r) => Number(r.rate)),
        },
        timestamp: new Date().toISOString(),
      });
    }
  );
}
