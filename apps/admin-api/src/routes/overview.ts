import type { FastifyInstance } from 'fastify';
import { adminAuth } from '../middleware/auth.js';

interface CountRow {
  count: string;
}

/**
 * GET /admin/overview
 *
 * 数据概览：用户/对话/模式/情绪/安全触发汇总。
 *
 * 注意：项目当前没有独立的 risk_logs 表，安全触发统计直接从
 * messages.risk_level 派生（CLAUDE.md §10 / Phase 7 埋点 + Phase 1 init）。
 */
export async function overviewRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/overview',
    { preHandler: adminAuth },
    async (_request, reply) => {
      const pool = app.pool;

      const [
        usersTotal,
        usersToday,
        usersWeek,
        usersMonth,
        sessionsTotal,
        messagesTotal,
        messagesToday,
        modesAgg,
        emotionsAgg,
        safetyTotal,
        safetyHigh,
        safetyCritical,
        safetyToday,
      ] = await Promise.all([
        pool.query<CountRow>('SELECT COUNT(*)::text AS count FROM users'),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '1 day'"
        ),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"
        ),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"
        ),
        pool.query<CountRow>('SELECT COUNT(*)::text AS count FROM sessions'),
        pool.query<CountRow>('SELECT COUNT(*)::text AS count FROM messages'),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM messages WHERE created_at >= NOW() - INTERVAL '1 day'"
        ),
        pool.query<{ mode: string | null; count: string }>(
          `SELECT intake_result->>'next_mode' AS mode, COUNT(*)::text AS count
             FROM messages
            WHERE intake_result IS NOT NULL
            GROUP BY mode`
        ),
        pool.query<{ emotion: string | null; count: string }>(
          `SELECT intake_result->>'emotion_state' AS emotion, COUNT(*)::text AS count
             FROM messages
            WHERE intake_result IS NOT NULL
            GROUP BY emotion`
        ),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM messages WHERE risk_level IN ('high', 'critical')"
        ),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM messages WHERE risk_level = 'high'"
        ),
        pool.query<CountRow>(
          "SELECT COUNT(*)::text AS count FROM messages WHERE risk_level = 'critical'"
        ),
        pool.query<CountRow>(
          `SELECT COUNT(*)::text AS count
             FROM messages
            WHERE risk_level IN ('high', 'critical')
              AND created_at >= NOW() - INTERVAL '1 day'`
        ),
      ]);

      const totalUsers = Number(usersTotal.rows[0]?.count ?? '0');
      const totalMessages = Number(messagesTotal.rows[0]?.count ?? '0');

      const modes: Record<string, number> = {
        companion: 0,
        analysis: 0,
        coach: 0,
        recovery: 0,
        safety: 0,
      };
      for (const row of modesAgg.rows) {
        if (row.mode && row.mode in modes) {
          modes[row.mode] = Number(row.count);
        }
      }

      const emotions: Record<string, number> = {};
      for (const row of emotionsAgg.rows) {
        if (row.emotion) emotions[row.emotion] = Number(row.count);
      }

      return reply.send({
        success: true,
        data: {
          users: {
            total: totalUsers,
            today: Number(usersToday.rows[0]?.count ?? '0'),
            this_week: Number(usersWeek.rows[0]?.count ?? '0'),
            this_month: Number(usersMonth.rows[0]?.count ?? '0'),
          },
          conversations: {
            total_sessions: Number(sessionsTotal.rows[0]?.count ?? '0'),
            total_messages: totalMessages,
            today_messages: Number(messagesToday.rows[0]?.count ?? '0'),
            avg_messages_per_user:
              totalUsers > 0
                ? Math.round((totalMessages / totalUsers) * 100) / 100
                : 0,
          },
          modes,
          emotions,
          safety_triggers: {
            total: Number(safetyTotal.rows[0]?.count ?? '0'),
            high: Number(safetyHigh.rows[0]?.count ?? '0'),
            critical: Number(safetyCritical.rows[0]?.count ?? '0'),
            today: Number(safetyToday.rows[0]?.count ?? '0'),
          },
        },
        timestamp: new Date().toISOString(),
      });
    }
  );
}
