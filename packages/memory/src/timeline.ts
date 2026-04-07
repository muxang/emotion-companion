/**
 * 关系实体与事件抽取 - Phase 5
 *
 * 由 orchestrator fire-and-forget 调用：
 *
 *   void extractAndSaveEntities(...)
 *
 * - 用 AI 从最近的对话中识别"关系对象"与"关键事件"
 * - 输出严格 JSON，解析失败静默 return（不影响主流程）
 * - 高风险会话跳过（不写长期记忆）
 * - memory_enabled=false 跳过
 * - 同名 entity 去重：(user_id, label) 已存在则不再插入
 */
import type { Pool } from 'pg';
import type { AIClient } from '@emotion/core-ai';

const HIGH_RISK = new Set(['high', 'critical']);

const EXTRACT_SYSTEM = `你是情感陪伴助手的关系抽取器。你的任务：从一段对话中识别"关系对象"与"关键事件"。

【输出格式】严格 JSON，禁止任何多余文字、不要 markdown、不要代码块标记：
{
  "entities": [
    { "label": "短称呼，最多8字", "relation_type": "ex|partner|ambiguous|friend|family|other", "notes": "可选，最多30字" }
  ],
  "events": [
    { "event_type": "breakup|reconcile|cold-war|lost-contact|confession|first-meet|other", "event_time": null, "summary": "客观事件描述，最多40字" }
  ]
}

【识别规则】
- 只识别用户明确提到的关系对象，不要凭空推测
- 不要把用户自己当成 entity
- 仅在用户明确提到具体事件时才输出 event
- event_time 通常无法确定，写 null 即可
- summary 必须是客观描述，不包含情绪原话
- 若没有可识别的内容，返回 {"entities":[],"events":[]}

直接输出 JSON。`;

interface MessageRow {
  role: 'user' | 'assistant' | 'system';
  content: string;
  risk_level: string | null;
}

interface ExtractedEntity {
  label: string;
  relation_type?: string | null;
  notes?: string | null;
}

interface ExtractedEvent {
  event_type: string;
  event_time?: string | null;
  summary: string;
}

interface ExtractedPayload {
  entities: ExtractedEntity[];
  events: ExtractedEvent[];
}

const ALLOWED_RELATION_TYPES = new Set([
  'ex',
  'partner',
  'ambiguous',
  'friend',
  'family',
  'other',
]);

export interface ExtractAndSaveDeps {
  pool: Pool;
  ai: AIClient;
  timeoutMs?: number;
}

export async function extractAndSaveEntities(
  deps: ExtractAndSaveDeps,
  sessionId: string,
  userId: string,
  memoryEnabled: boolean
): Promise<{
  entitiesAdded: number;
  eventsAdded: number;
  reason?: string;
}> {
  if (!memoryEnabled) {
    return { entitiesAdded: 0, eventsAdded: 0, reason: 'memory_disabled' };
  }

  const { pool, ai } = deps;

  // 1) 拉本会话最近 12 条消息
  const msgRes = await pool.query<MessageRow>(
    `SELECT role, content, risk_level
     FROM messages
     WHERE session_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT 12`,
    [sessionId]
  );
  const rows = msgRes.rows.slice().reverse();
  if (rows.length < 2) {
    return { entitiesAdded: 0, eventsAdded: 0, reason: 'too_few_messages' };
  }

  // 2) 高风险跳过
  if (rows.some((m) => m.risk_level && HIGH_RISK.has(m.risk_level))) {
    return { entitiesAdded: 0, eventsAdded: 0, reason: 'high_risk_skipped' };
  }

  const transcript = rows
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  // 3) 调 AI
  let raw: string;
  try {
    raw = await ai.complete({
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `请从下面的对话中识别关系对象与关键事件，输出 JSON：\n\n${transcript}`,
        },
      ],
      maxTokens: 600,
      timeoutMs: deps.timeoutMs ?? 20_000,
    });
  } catch {
    return { entitiesAdded: 0, eventsAdded: 0, reason: 'ai_failed' };
  }

  // 4) 解析 JSON（容忍前后空白与可能的代码块）
  const payload = parseExtractPayload(raw);
  if (!payload) {
    return { entitiesAdded: 0, eventsAdded: 0, reason: 'parse_failed' };
  }

  // 5) 写入 entities（去重 by user_id+label，case-insensitive）
  let entitiesAdded = 0;
  for (const e of payload.entities.slice(0, 5)) {
    const label = (e.label ?? '').trim();
    if (label.length === 0 || label.length > 64) continue;

    const relationType =
      e.relation_type && ALLOWED_RELATION_TYPES.has(e.relation_type)
        ? e.relation_type
        : null;
    const notes =
      typeof e.notes === 'string' && e.notes.trim().length > 0
        ? e.notes.trim().slice(0, 200)
        : null;

    // 去重：lower(label) 命中则跳过
    const exists = await pool.query<{ id: string }>(
      `SELECT id FROM relationship_entities
       WHERE user_id = $1 AND lower(label) = lower($2)
       LIMIT 1`,
      [userId, label]
    );
    if (exists.rows.length > 0) continue;

    await pool.query(
      `INSERT INTO relationship_entities
         (user_id, label, relation_type, notes)
       VALUES ($1, $2, $3, $4)`,
      [userId, label, relationType, notes]
    );
    entitiesAdded++;
  }

  // 6) 写入 events（不做强去重，由 timeline 接口前端展示时合并）
  let eventsAdded = 0;
  for (const ev of payload.events.slice(0, 5)) {
    const summary = (ev.summary ?? '').trim();
    if (summary.length === 0 || summary.length > 200) continue;
    const eventType = (ev.event_type ?? '').trim().slice(0, 64);
    if (eventType.length === 0) continue;

    const eventTime =
      ev.event_time && /^\d{4}-\d{2}-\d{2}/.test(ev.event_time)
        ? ev.event_time
        : null;

    await pool.query(
      `INSERT INTO relationship_events
         (user_id, event_type, event_time, summary)
       VALUES ($1, $2, $3, $4)`,
      [userId, eventType, eventTime, summary]
    );
    eventsAdded++;
  }

  return { entitiesAdded, eventsAdded };
}

function parseExtractPayload(raw: string): ExtractedPayload | null {
  if (!raw) return null;
  let text = raw.trim();
  // 去掉可能的 ```json fence
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  // 截取 { 到最后一个 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as Partial<ExtractedPayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    return { entities, events };
  } catch {
    return null;
  }
}
