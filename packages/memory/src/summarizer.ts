/**
 * 摘要生成器 - Phase 5
 *
 * 在每条 assistant 消息写入后由 orchestrator fire-and-forget 触发：
 *
 *   void generateSessionSummary(...)
 *
 * - 仅当本次会话新增消息后才生成（用 created_at > last_summary.created_at 判断）
 * - risk_level >= high 的会话直接跳过（CLAUDE.md §14.2）
 * - 摘要 100~200 字，只写：核心议题 / 关键事件 / 状态变化 / 建议接受
 * - 摘要不写：用户原话 / 崩溃细节
 * - 任何异常静默吞掉（由调用方记 warn 日志）
 */
import type { Pool } from 'pg';
import type { AIClient } from '@emotion/core-ai';

const HIGH_RISK = new Set(['high', 'critical']);

const SUMMARIZER_SYSTEM = `你是情感陪伴助手的会话摘要器。你的任务：把一段对话压缩成 100~200 字的中文摘要。

【必须包含】
- 核心议题：用户在谈什么关系/事件
- 关键事实：客观发生了什么（不写情绪原话）
- 状态变化：用户从哪种状态走到哪种状态
- 建议接受情况：用户是否接住了某个具体动作建议

【绝对禁止】
- 复述用户原话
- 复述任何脆弱或崩溃的细节
- 写"用户哭了/崩溃了/绝望地说"等情绪化表达
- 写超过 200 字
- 写少于 80 字
- 加任何格式标记（不要 markdown，不要列表，纯文字一段）

直接输出摘要正文，不要任何前缀或解释。`;

interface MessageRow {
  role: 'user' | 'assistant' | 'system';
  content: string;
  risk_level: string | null;
  created_at: Date;
}

interface LastSummaryRow {
  created_at: Date;
}

export interface GenerateSessionSummaryDeps {
  pool: Pool;
  ai: AIClient;
  /** 软超时（毫秒），默认 20s */
  timeoutMs?: number;
}

export async function generateSessionSummary(
  deps: GenerateSessionSummaryDeps,
  sessionId: string,
  userId: string,
  memoryEnabled: boolean
): Promise<{ written: boolean; reason?: string }> {
  if (!memoryEnabled) return { written: false, reason: 'memory_disabled' };

  const { pool, ai } = deps;

  // 1) 拉本会话最近 20 条消息
  const msgRes = await pool.query<MessageRow>(
    `SELECT role, content, risk_level, created_at
     FROM messages
     WHERE session_id = $1
       AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT 20`,
    [sessionId]
  );
  const rows = msgRes.rows.slice().reverse();
  if (rows.length < 2) {
    return { written: false, reason: 'too_few_messages' };
  }

  // 2) 高风险跳过
  const hasHighRisk = rows.some(
    (m) => m.risk_level && HIGH_RISK.has(m.risk_level)
  );
  if (hasHighRisk) {
    return { written: false, reason: 'high_risk_skipped' };
  }

  // 3) 是否需要更新（与上次 summary 时间比较）
  const lastSumRes = await pool.query<LastSummaryRow>(
    `SELECT created_at FROM memory_summaries
     WHERE user_id = $1 AND session_id = $2 AND summary_type = 'session'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, sessionId]
  );
  const lastSummaryAt = lastSumRes.rows[0]?.created_at;
  if (lastSummaryAt) {
    const newest = rows[rows.length - 1]?.created_at;
    if (newest && newest.getTime() <= lastSummaryAt.getTime()) {
      return { written: false, reason: 'no_new_messages' };
    }
  }

  // 4) 调用 AI 生成摘要
  const transcript = rows
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  const summary = await ai.complete({
    system: SUMMARIZER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `下面是一段对话，请按要求生成 100~200 字的中文摘要：\n\n${transcript}`,
      },
    ],
    maxTokens: 400,
    timeoutMs: deps.timeoutMs ?? 20_000,
  });

  const text = summary.trim();
  if (text.length === 0) {
    return { written: false, reason: 'empty_summary' };
  }
  // 软约束：超长截断到 220 字
  const finalText = text.length > 220 ? text.slice(0, 220) : text;

  // 5) 写入 memory_summaries
  await pool.query(
    `INSERT INTO memory_summaries
       (user_id, session_id, summary_type, summary_text)
     VALUES ($1, $2, 'session', $3)`,
    [userId, sessionId, finalText]
  );

  return { written: true };
}
