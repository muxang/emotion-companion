/**
 * 长期记忆 - Phase 5
 *
 * 聚合 user_profiles / relationship_entities / relationship_events /
 * memory_summaries 四张表，给 orchestrator Step 5 注入 prompt 使用。
 *
 * memory_enabled=false 时直接返回空骨架，不查询数据库（CLAUDE.md §14.3）。
 */
import type { Pool } from 'pg';
import type {
  MemorySummaryDTO,
  RelationshipEntityDTO,
  RelationshipEventDTO,
  UserMemory,
  UserProfileDTO,
} from '@emotion/shared';

const EMPTY_MEMORY: UserMemory = {
  profile: null,
  entities: [],
  recentSummaries: [],
  recentEvents: [],
};

interface ProfileRow {
  user_id: string;
  traits_json: Record<string, unknown> | null;
  attachment_style: string | null;
  boundary_preferences: Record<string, unknown> | null;
  common_triggers: string[] | null;
  updated_at: Date;
}

interface EntityRow {
  id: string;
  user_id: string;
  label: string;
  relation_type: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface EventRow {
  id: string;
  user_id: string;
  entity_id: string | null;
  event_type: string;
  event_time: Date | null;
  summary: string;
  evidence_json: unknown[] | null;
  created_at: Date;
}

interface SummaryRow {
  id: string;
  user_id: string;
  session_id: string | null;
  summary_type: 'session' | 'weekly' | 'entity';
  summary_text: string;
  created_at: Date;
}

export interface GetUserMemoryOptions {
  /** 最近多少条 summary，默认 3 */
  summaryLimit?: number;
  /** 最近多少条事件，默认 10 */
  eventLimit?: number;
  /** 最多多少个 entity，默认 20 */
  entityLimit?: number;
}

/**
 * 拉取用户长期记忆聚合视图。
 * memory_enabled=false 时立刻返回空骨架（不触达 DB）。
 */
export async function getUserMemory(
  pool: Pool,
  userId: string,
  memoryEnabled: boolean,
  options: GetUserMemoryOptions = {}
): Promise<UserMemory> {
  if (!memoryEnabled) return { ...EMPTY_MEMORY };

  const summaryLimit = options.summaryLimit ?? 3;
  const eventLimit = options.eventLimit ?? 10;
  const entityLimit = options.entityLimit ?? 20;

  // 用单连接串行执行，避免 4 条并行查询各占 1 个连接打满 Pool
  const client = await pool.connect();
  let profileRes, entitiesRes, summariesRes, eventsRes;
  try {
    profileRes = await client.query<ProfileRow>(
      `SELECT user_id, traits_json, attachment_style,
              boundary_preferences, common_triggers, updated_at
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    entitiesRes = await client.query<EntityRow>(
      `SELECT id, user_id, label, relation_type, notes, created_at, updated_at
       FROM relationship_entities
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [userId, entityLimit]
    );
    summariesRes = await client.query<SummaryRow>(
      `SELECT id, user_id, session_id, summary_type, summary_text, created_at
       FROM memory_summaries
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, summaryLimit]
    );
    eventsRes = await client.query<EventRow>(
      `SELECT id, user_id, entity_id, event_type, event_time,
              summary, evidence_json, created_at
       FROM relationship_events
       WHERE user_id = $1
       ORDER BY event_time DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [userId, eventLimit]
    );
  } finally {
    client.release();
  }

  const profile: UserProfileDTO | null = profileRes.rows[0]
    ? {
        user_id: profileRes.rows[0].user_id,
        traits_json: profileRes.rows[0].traits_json ?? {},
        attachment_style: profileRes.rows[0].attachment_style,
        boundary_preferences: profileRes.rows[0].boundary_preferences ?? {},
        common_triggers: profileRes.rows[0].common_triggers ?? [],
        updated_at: profileRes.rows[0].updated_at.toISOString(),
      }
    : null;

  const entities: RelationshipEntityDTO[] = entitiesRes.rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    label: r.label,
    relation_type: r.relation_type,
    notes: r.notes,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }));

  const recentSummaries: MemorySummaryDTO[] = summariesRes.rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    session_id: r.session_id,
    summary_type: r.summary_type,
    summary_text: r.summary_text,
    created_at: r.created_at.toISOString(),
  }));

  const recentEvents: RelationshipEventDTO[] = eventsRes.rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    entity_id: r.entity_id,
    event_type: r.event_type,
    event_time: r.event_time ? r.event_time.toISOString() : null,
    summary: r.summary,
    evidence_json: r.evidence_json ?? [],
    created_at: r.created_at.toISOString(),
  }));

  return { profile, entities, recentSummaries, recentEvents };
}

/**
 * 智能融合层：渲染 formatMemoryContext 时可附加的实时状态。
 * 由 orchestrator 在 Step 5 注入，用于让 companion 回复主动感知计划状态。
 */
export interface MemoryContextExtras {
  activePlan?: {
    plan_type: string;
    current_day: number;
    total_days: number;
  };
  /** 今日是否已为 active plan 打卡 */
  checkedInToday?: boolean;
}

/**
 * 把 UserMemory 渲染为可注入 system prompt 的简短上下文片段。
 * 空记忆返回空字符串。注入风格保持克制，不展示内部 reasoning。
 *
 * 第二可选参数 extras：携带 active 计划与打卡状态等实时信息。
 */
const RELATION_CN: Record<string, string> = {
  ex: '前任',
  partner: '伴侣',
  ambiguous: '暧昧对象',
  friend: '朋友',
  family: '家人',
};

const PLAN_CN: Record<string, string> = {
  '7day-breakup': '7天走出失恋',
  '14day-rumination': '14天停止内耗',
};

/**
 * 从最近 user 消息中提取"决定性"语句。
 * 不调 AI，纯正则匹配。
 */
const DECISION_RE =
  /我决定|我打算|我要|我不会再|从今天起|我选择|我准备/;

export async function getRecentDecisions(
  pool: Pool,
  userId: string,
  limit = 3
): Promise<string[]> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ content: string }>(
      `SELECT m.content FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.user_id = $1 AND m.role = 'user'
       ORDER BY m.created_at DESC LIMIT 30`,
      [userId]
    );
    const hits: string[] = [];
    for (const row of res.rows) {
      if (DECISION_RE.test(row.content)) {
        hits.push(row.content.slice(0, 40).replace(/\n/g, ' '));
        if (hits.length >= limit) break;
      }
    }
    return hits;
  } finally {
    client.release();
  }
}

/**
 * 叙事风格的记忆上下文——给 AI 读的是"故事"，不是"数据"。
 *
 * extras.decisions 由调用方调 getRecentDecisions 后传入（可选）。
 */
export function formatMemoryContext(
  memory: UserMemory,
  extras?: MemoryContextExtras & { decisions?: string[] }
): string {
  const parts: string[] = [];
  parts.push('【这个人的情况】');

  // 最近摘要
  if (memory.recentSummaries.length > 0) {
    const s = memory.recentSummaries[0]!;
    parts.push(`上次他来，说的是："${s.summary_text.slice(0, 50)}"`);
  }

  // 关系对象
  if (memory.entities.length > 0) {
    const e = memory.entities[0]!;
    const rel = e.relation_type
      ? RELATION_CN[e.relation_type] ?? '对方'
      : '对方';
    parts.push(`他经常提到：${e.label}（关系：${rel}）`);
    // 如果有相关事件
    if (memory.recentEvents.length > 0) {
      const evt = memory.recentEvents[0]!;
      parts.push(`关于这个人，他说过的事："${evt.summary.slice(0, 40)}"`);
    }
  }

  // 恢复计划
  if (extras?.activePlan) {
    const p = extras.activePlan;
    const planLabel = PLAN_CN[p.plan_type] ?? p.plan_type;
    const checkin =
      extras.checkedInToday === true
        ? '今天打卡了。'
        : extras.checkedInToday === false
          ? '今天还没打卡。'
          : '';
    parts.push(
      `他在做一个${planLabel}的计划，今天是第${p.current_day}天。${checkin}`
    );
  }

  // 最近决定
  if (extras?.decisions && extras.decisions.length > 0) {
    parts.push(
      `他最近说过想做的事：${extras.decisions.map((d) => `"${d}"`).join('、')}`
    );
  }

  // 如果只有标题没有实际内容
  if (parts.length <= 1) return '';

  return parts.join('\n');
}
