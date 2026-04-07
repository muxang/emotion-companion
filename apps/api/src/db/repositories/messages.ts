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

export interface AppendMessageInput {
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  risk_level?: RiskLevel | null;
  /** intake_result 写入 jsonb；orchestrator 已剥离 reasoning */
  intake_result?: Record<string, unknown> | null;
  /** structured_json 写入 jsonb；Phase 2 暂不写入，预留 */
  structured_json?: Record<string, unknown> | null;
}

export interface MessageRepository {
  listBySession(sessionId: string): Promise<MessageDTO[]>;
  /** 最近 N 条消息（按 created_at 升序），用于注入 AI 上下文 */
  recentBySession(sessionId: string, limit: number): Promise<MessageDTO[]>;
  /** 最近一条 assistant 消息的 risk_level（用于脆弱状态缓冲） */
  lastAssistantRisk(sessionId: string): Promise<RiskLevel | null>;
  append(input: AppendMessageInput): Promise<MessageDTO>;
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

    async recentBySession(sessionId, limit) {
      const res = await pool.query<MessageRow>(
        `SELECT id, session_id, role, content, risk_level, created_at
         FROM (
           SELECT id, session_id, role, content, risk_level, created_at
           FROM messages
           WHERE session_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         ) sub
         ORDER BY created_at ASC`,
        [sessionId, limit]
      );
      return res.rows.map(toDTO);
    },

    async lastAssistantRisk(sessionId) {
      const res = await pool.query<{ risk_level: RiskLevel | null }>(
        `SELECT risk_level
         FROM messages
         WHERE session_id = $1 AND role = 'assistant'
         ORDER BY created_at DESC
         LIMIT 1`,
        [sessionId]
      );
      return res.rows[0]?.risk_level ?? null;
    },

    async append(input) {
      const res = await pool.query<MessageRow>(
        `INSERT INTO messages
           (session_id, role, content, risk_level, intake_result, structured_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, session_id, role, content, risk_level, created_at`,
        [
          input.session_id,
          input.role,
          input.content,
          input.risk_level ?? null,
          input.intake_result ? JSON.stringify(input.intake_result) : null,
          input.structured_json ? JSON.stringify(input.structured_json) : null,
        ]
      );
      const row = res.rows[0];
      if (!row) {
        throw new Error('messages.append: insert returned no row');
      }
      return toDTO(row);
    },
  };
}
