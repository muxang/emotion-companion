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
export function formatMemoryContext(
  memory: UserMemory,
  extras?: MemoryContextExtras
): string {
  const parts: string[] = [];

  if (extras?.activePlan) {
    const p = extras.activePlan;
    const checkin =
      extras.checkedInToday === true
        ? '今日已打卡'
        : extras.checkedInToday === false
          ? '今日尚未打卡'
          : '';
    const planLabel =
      p.plan_type === '7day-breakup'
        ? '7天失恋恢复计划'
        : p.plan_type === '14day-rumination'
          ? '14天停止内耗计划'
          : `${p.plan_type} 计划`;
    const line = `- 有一个进行中的${planLabel}，今天是第${p.current_day}天（共${p.total_days}天）${checkin ? '；' + checkin : ''}`;
    parts.push(`【用户当前状态】\n${line}`);
  }

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
