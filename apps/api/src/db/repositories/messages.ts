import type { Pool } from 'pg';
import type { MessageDTO, RiskLevel } from '@emotion/shared';

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  risk_level: RiskLevel | null;
  created_at: Date;
}

function toDTO(row: MessageRow): MessageDTO {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    risk_level: row.risk_level,
    created_at: row.created_at.toISOString(),
  };
}

export interface MessageRepository {
  listBySession(sessionId: string): Promise<MessageDTO[]>;
  /** Phase 1 占位：不在 mock 流中调用，留待 Phase 2 真实 AI 接入后实现写入。 */
  append?(input: {
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    risk_level?: RiskLevel | null;
  }): Promise<MessageDTO>;
}

export function createMessageRepository(pool: Pool): MessageRepository {
  return {
    async listBySession(sessionId) {
      const res = await pool.query<MessageRow>(
        `SELECT id, session_id, role, content, risk_level, created_at
         FROM messages
         WHERE session_id = $1
         ORDER BY created_at ASC`,
        [sessionId]
      );
      return res.rows.map(toDTO);
    },
  };
}
