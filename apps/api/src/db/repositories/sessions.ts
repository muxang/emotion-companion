import type { Pool } from 'pg';
import type { ConversationMode, SessionDTO } from '@emotion/shared';

export interface SessionRow {
  id: string;
  user_id: string;
  title: string;
  mode: ConversationMode;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

function toDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    mode: row.mode,
    message_count: row.message_count,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export interface CreateSessionParams {
  user_id: string;
  title?: string;
  mode?: ConversationMode;
}

export interface SessionRepository {
  listByUser(userId: string): Promise<SessionDTO[]>;
  findById(id: string): Promise<SessionDTO | null>;
  create(params: CreateSessionParams): Promise<SessionDTO>;
  delete(id: string, userId: string): Promise<boolean>;
}

export function createSessionRepository(pool: Pool): SessionRepository {
  return {
    async listByUser(userId) {
      const res = await pool.query<SessionRow>(
        `SELECT * FROM sessions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId]
      );
      return res.rows.map(toDTO);
    },

    async findById(id) {
      const res = await pool.query<SessionRow>(
        'SELECT * FROM sessions WHERE id = $1 LIMIT 1',
        [id]
      );
      const row = res.rows[0];
      return row ? toDTO(row) : null;
    },

    async create(params) {
      const res = await pool.query<SessionRow>(
        `INSERT INTO sessions (user_id, title, mode)
         VALUES ($1, COALESCE($2, '新对话'), COALESCE($3, 'companion'))
         RETURNING *`,
        [params.user_id, params.title ?? null, params.mode ?? null]
      );
      const row = res.rows[0];
      if (!row) {
        throw new Error('createSession: insert returned no row');
      }
      return toDTO(row);
    },

    async delete(id, userId) {
      const res = await pool.query(
        'DELETE FROM sessions WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return (res.rowCount ?? 0) > 0;
    },
  };
}
