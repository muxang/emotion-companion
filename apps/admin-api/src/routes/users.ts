import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional(),
});

const SessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

interface UserListRow {
  id: string;
  anonymous_id: string;
  created_at: Date;
  last_active_at: Date | null;
  total_sessions: string;
  total_messages: string;
  memory_enabled: boolean;
  tone_preference: string;
  has_active_plan: boolean;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', adminAuth);

  // ---- list ----
  app.get('/users', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsed.error.message },
        timestamp: new Date().toISOString(),
      });
    }
    const { page, limit, search } = parsed.data;
    const offset = (page - 1) * limit;
    const pool = app.pool;

    const where: string[] = [];
    const params: unknown[] = [];
    if (search && search.length > 0) {
      params.push(`%${search}%`);
      where.push(`u.anonymous_id ILIKE $${params.length}`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalSql = `SELECT COUNT(*)::text AS count FROM users u ${whereSql}`;
    const totalRes = await pool.query<{ count: string }>(totalSql, params);
    const total = Number(totalRes.rows[0]?.count ?? '0');

    params.push(limit);
    params.push(offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const listSql = `
      SELECT
        u.id,
        u.anonymous_id,
        u.created_at,
        u.memory_enabled,
        u.tone_preference,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS total_sessions,
        (SELECT COUNT(*) FROM messages m
           JOIN sessions s ON s.id = m.session_id
          WHERE s.user_id = u.id) AS total_messages,
        (SELECT MAX(m.created_at) FROM messages m
           JOIN sessions s ON s.id = m.session_id
          WHERE s.user_id = u.id) AS last_active_at,
        EXISTS (
          SELECT 1 FROM recovery_plans rp
           WHERE rp.user_id = u.id AND rp.status = 'active'
        ) AS has_active_plan
      FROM users u
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const listRes = await pool.query<UserListRow>(listSql, params);

    return reply.send({
      success: true,
      data: listRes.rows.map((r) => ({
        id: r.id,
        anonymous_id: r.anonymous_id,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        last_active_at: r.last_active_at
          ? r.last_active_at instanceof Date
            ? r.last_active_at.toISOString()
            : r.last_active_at
          : null,
        total_sessions: Number(r.total_sessions),
        total_messages: Number(r.total_messages),
        memory_enabled: r.memory_enabled,
        tone_preference: r.tone_preference,
        has_active_plan: r.has_active_plan,
      })),
      total,
      page,
      timestamp: new Date().toISOString(),
    });
  });

  // ---- detail ----
  app.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const pool = app.pool;

    const userRes = await pool.query(
      `SELECT id, anonymous_id, email, open_id, nickname, tone_preference,
              memory_enabled, created_at, updated_at
         FROM users WHERE id = $1`,
      [id]
    );
    if (userRes.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'user not found' },
        timestamp: new Date().toISOString(),
      });
    }

    const [
      statsRes,
      sessionsRes,
      planRes,
      entitiesRes,
      trendRes,
    ] = await Promise.all([
      pool.query<{
        total_sessions: string;
        total_messages: string;
        avg_risk_level: string | null;
        dominant_emotion: string | null;
        days_active: string;
      }>(
        `SELECT
            (SELECT COUNT(*) FROM sessions WHERE user_id = $1)::text AS total_sessions,
            (SELECT COUNT(*) FROM messages m
               JOIN sessions s ON s.id = m.session_id
              WHERE s.user_id = $1)::text AS total_messages,
            (SELECT mode() WITHIN GROUP (ORDER BY m.risk_level)
               FROM messages m
               JOIN sessions s ON s.id = m.session_id
              WHERE s.user_id = $1 AND m.risk_level IS NOT NULL) AS avg_risk_level,
            (SELECT mode() WITHIN GROUP (ORDER BY m.intake_result->>'emotion_state')
               FROM messages m
               JOIN sessions s ON s.id = m.session_id
              WHERE s.user_id = $1 AND m.intake_result IS NOT NULL) AS dominant_emotion,
            (SELECT COUNT(DISTINCT DATE(m.created_at))
               FROM messages m
               JOIN sessions s ON s.id = m.session_id
              WHERE s.user_id = $1)::text AS days_active`,
        [id]
      ),
      pool.query(
        `SELECT s.id, s.title, s.message_count, s.created_at,
                (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.id) AS last_message_at
           FROM sessions s
          WHERE s.user_id = $1
          ORDER BY s.created_at DESC
          LIMIT 10`,
        [id]
      ),
      pool.query(
        `SELECT * FROM recovery_plans
          WHERE user_id = $1 AND status = 'active'
          ORDER BY started_at DESC
          LIMIT 1`,
        [id]
      ),
      pool.query(
        `SELECT * FROM relationship_entities
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [id]
      ),
      pool.query<{ date: string; avg_score: string | null }>(
        `WITH days AS (
            SELECT generate_series(
              (CURRENT_DATE - INTERVAL '13 days')::date,
              CURRENT_DATE::date,
              INTERVAL '1 day'
            )::date AS date
          )
          SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
                 AVG(
                   CASE m.intake_result->>'emotion_state'
                     WHEN 'desperate' THEN 1
                     WHEN 'numb'      THEN 2
                     WHEN 'angry'     THEN 3
                     WHEN 'sad'       THEN 4
                     WHEN 'lonely'    THEN 4
                     WHEN 'anxious'   THEN 5
                     WHEN 'confused'  THEN 5
                     WHEN 'mixed'     THEN 6
                     ELSE NULL
                   END
                 )::text AS avg_score
            FROM days d
            LEFT JOIN messages m
              JOIN sessions s ON s.id = m.session_id
              ON DATE(m.created_at) = d.date AND s.user_id = $1
           GROUP BY d.date
           ORDER BY d.date`,
        [id]
      ),
    ]);

    const stats = statsRes.rows[0];

    return reply.send({
      success: true,
      data: {
        user: userRes.rows[0],
        stats: {
          total_sessions: Number(stats?.total_sessions ?? '0'),
          total_messages: Number(stats?.total_messages ?? '0'),
          avg_risk_level: stats?.avg_risk_level ?? null,
          dominant_emotion: stats?.dominant_emotion ?? null,
          days_active: Number(stats?.days_active ?? '0'),
        },
        recent_sessions: sessionsRes.rows,
        active_plan: planRes.rows[0] ?? null,
        relationship_entities: entitiesRes.rows,
        emotion_trend: {
          daily: trendRes.rows.map((r) => ({
            date: r.date,
            avg_score: r.avg_score === null ? null : Number(r.avg_score),
          })),
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ---- user sessions list ----
  app.get<{ Params: { id: string } }>(
    '/users/:id/sessions',
    async (request, reply) => {
      const parsed = SessionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: parsed.error.message },
          timestamp: new Date().toISOString(),
        });
      }
      const { page, limit } = parsed.data;
      const offset = (page - 1) * limit;
      const { id } = request.params;
      const pool = app.pool;

      const totalRes = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM sessions WHERE user_id = $1',
        [id]
      );
      const listRes = await pool.query(
        `SELECT s.id, s.title, s.mode, s.message_count, s.created_at, s.updated_at,
                (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.id) AS last_message_at
           FROM sessions s
          WHERE s.user_id = $1
          ORDER BY s.created_at DESC
          LIMIT $2 OFFSET $3`,
        [id, limit, offset]
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

  // ---- single session messages ----
  app.get<{ Params: { id: string; sessionId: string } }>(
    '/users/:id/sessions/:sessionId',
    async (request, reply) => {
      const { id, sessionId } = request.params;
      const pool = app.pool;

      const sessionRes = await pool.query(
        `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
        [sessionId, id]
      );
      if (sessionRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'session not found' },
          timestamp: new Date().toISOString(),
        });
      }

      const messagesRes = await pool.query(
        `SELECT id, role, content, risk_level, intake_result, structured_json, created_at
           FROM messages
          WHERE session_id = $1
          ORDER BY created_at ASC`,
        [sessionId]
      );

      return reply.send({
        success: true,
        data: {
          session: sessionRes.rows[0],
          messages: messagesRes.rows,
        },
        timestamp: new Date().toISOString(),
      });
    }
  );
}
