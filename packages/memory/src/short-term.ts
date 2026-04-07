/**
 * 短期记忆 - Phase 5
 *
 * 直接读 messages 表的最近 N 条对话，用于注入 AI 上下文。
 * 与 apps/api/src/db/repositories/messages.recentBySession 等价，
 * 但 packages/memory 直接持有 Pool，避免 packages 反向依赖 apps/api。
 *
 * - 仅返回 user/assistant，不返回 system
 * - 仅返回 {role, content}（reasoning / intake_result 等内部字段不外露）
 */
import type { Pool } from 'pg';

export interface ShortTermMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageRow {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function getRecentMessages(
  pool: Pool,
  sessionId: string,
  limit = 6
): Promise<ShortTermMessage[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const res = await pool.query<MessageRow>(
    `SELECT role, content
     FROM (
       SELECT role, content, created_at
       FROM messages
       WHERE session_id = $1
         AND role IN ('user', 'assistant')
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [sessionId, safeLimit]
  );
  return res.rows
    .filter(
      (r): r is { role: 'user' | 'assistant'; content: string } =>
        r.role === 'user' || r.role === 'assistant'
    )
    .map((r) => ({ role: r.role, content: r.content }));
}
