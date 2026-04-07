import type { Pool } from 'pg';
import type { UserDTO } from '@emotion/shared';

export interface UserRow {
  id: string;
  anonymous_id: string;
  email: string | null;
  open_id: string | null;
  nickname: string | null;
  tone_preference: 'warm' | 'rational' | 'direct';
  memory_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function toDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    anonymous_id: row.anonymous_id,
    nickname: row.nickname,
    tone_preference: row.tone_preference,
    memory_enabled: row.memory_enabled,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export interface UserRepository {
  findByAnonymousId(anonymousId: string): Promise<UserDTO | null>;
  findById(id: string): Promise<UserDTO | null>;
  createWithAnonymousId(anonymousId: string): Promise<UserDTO>;
}

export function createUserRepository(pool: Pool): UserRepository {
  return {
    async findByAnonymousId(anonymousId) {
      const res = await pool.query<UserRow>(
        'SELECT * FROM users WHERE anonymous_id = $1 LIMIT 1',
        [anonymousId]
      );
      const row = res.rows[0];
      return row ? toDTO(row) : null;
    },

    async findById(id) {
      const res = await pool.query<UserRow>(
        'SELECT * FROM users WHERE id = $1 LIMIT 1',
        [id]
      );
      const row = res.rows[0];
      return row ? toDTO(row) : null;
    },

    async createWithAnonymousId(anonymousId) {
      const res = await pool.query<UserRow>(
        `INSERT INTO users (anonymous_id) VALUES ($1) RETURNING *`,
        [anonymousId]
      );
      const row = res.rows[0];
      if (!row) {
        throw new Error('createWithAnonymousId: insert returned no row');
      }
      return toDTO(row);
    },
  };
}
