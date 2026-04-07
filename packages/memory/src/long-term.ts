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

  const [profileRes, entitiesRes, summariesRes, eventsRes] = await Promise.all([
    pool.query<ProfileRow>(
      `SELECT user_id, traits_json, attachment_style,
              boundary_preferences, common_triggers, updated_at
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    ),
    pool.query<EntityRow>(
      `SELECT id, user_id, label, relation_type, notes, created_at, updated_at
       FROM relationship_entities
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [userId, entityLimit]
    ),
    pool.query<SummaryRow>(
      `SELECT id, user_id, session_id, summary_type, summary_text, created_at
       FROM memory_summaries
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, summaryLimit]
    ),
    pool.query<EventRow>(
      `SELECT id, user_id, entity_id, event_type, event_time,
              summary, evidence_json, created_at
       FROM relationship_events
       WHERE user_id = $1
       ORDER BY event_time DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [userId, eventLimit]
    ),
  ]);

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
 * 把 UserMemory 渲染为可注入 system prompt 的简短上下文片段。
 * 空记忆返回空字符串。注入风格保持克制，不展示内部 reasoning。
 */
export function formatMemoryContext(memory: UserMemory): string {
  const parts: string[] = [];

  if (memory.profile) {
    const p = memory.profile;
    const bits: string[] = [];
    if (p.attachment_style) bits.push(`依恋风格：${p.attachment_style}`);
    if (p.common_triggers.length > 0) {
      bits.push(`常见触发点：${p.common_triggers.slice(0, 5).join('、')}`);
    }
    if (bits.length > 0) parts.push(`【用户画像】${bits.join('；')}`);
  }

  if (memory.entities.length > 0) {
    const labels = memory.entities
      .slice(0, 5)
      .map((e) =>
        e.relation_type ? `${e.label}（${e.relation_type}）` : e.label
      )
      .join('、');
    parts.push(`【关系对象】${labels}`);
  }

  if (memory.recentEvents.length > 0) {
    const lines = memory.recentEvents.slice(0, 3).map((e) => {
      const when = e.event_time
        ? new Date(e.event_time).toISOString().slice(0, 10)
        : '时间未知';
      return `- ${when} ${e.event_type}：${e.summary}`;
    });
    parts.push(`【关键事件】\n${lines.join('\n')}`);
  }

  if (memory.recentSummaries.length > 0) {
    const lines = memory.recentSummaries
      .slice(0, 3)
      .map((s, i) => `${i + 1}. ${s.summary_text}`);
    parts.push(`【近期会话摘要】\n${lines.join('\n')}`);
  }

  return parts.join('\n\n');
}
