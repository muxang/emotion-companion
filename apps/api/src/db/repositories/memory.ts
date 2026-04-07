/**
 * Memory repository - Phase 5
 *
 * 服务于路由层 CRUD 与删除/匿名化操作。
 * 写操作必须先检查 user.memory_enabled（CLAUDE.md §14.3）。
 *
 * 注意：packages/memory 内部直接使用 Pool 实现业务流程；
 * 此 repository 只负责 routes 层的同步 CRUD，两者并存。
 */
import type { Pool, PoolClient } from 'pg';
import type {
  MemorySummaryDTO,
  RelationshipEntityDTO,
  RelationshipEventDTO,
  SummaryType,
  UserProfileDTO,
} from '@emotion/shared';

interface UserProfileRow {
  user_id: string;
  traits_json: Record<string, unknown>;
  attachment_style: string | null;
  boundary_preferences: Record<string, unknown>;
  common_triggers: string[];
  updated_at: Date;
}

interface RelationshipEntityRow {
  id: string;
  user_id: string;
  label: string;
  relation_type: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RelationshipEventRow {
  id: string;
  user_id: string;
  entity_id: string | null;
  event_type: string;
  event_time: Date | null;
  summary: string;
  evidence_json: unknown[];
  created_at: Date;
}

interface MemorySummaryRow {
  id: string;
  user_id: string;
  session_id: string | null;
  summary_type: SummaryType;
  summary_text: string;
  created_at: Date;
}

function profileToDTO(row: UserProfileRow): UserProfileDTO {
  return {
    user_id: row.user_id,
    traits_json: row.traits_json ?? {},
    attachment_style: row.attachment_style,
    boundary_preferences: row.boundary_preferences ?? {},
    common_triggers: row.common_triggers ?? [],
    updated_at: row.updated_at.toISOString(),
  };
}

function entityToDTO(row: RelationshipEntityRow): RelationshipEntityDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    label: row.label,
    relation_type: row.relation_type,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function eventToDTO(row: RelationshipEventRow): RelationshipEventDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    entity_id: row.entity_id,
    event_type: row.event_type,
    event_time: row.event_time ? row.event_time.toISOString() : null,
    summary: row.summary,
    evidence_json: row.evidence_json ?? [],
    created_at: row.created_at.toISOString(),
  };
}

function summaryToDTO(row: MemorySummaryRow): MemorySummaryDTO {
  return {
    id: row.id,
    user_id: row.user_id,
    session_id: row.session_id,
    summary_type: row.summary_type,
    summary_text: row.summary_text,
    created_at: row.created_at.toISOString(),
  };
}

export interface UpsertProfileInput {
  traits_json?: Record<string, unknown>;
  attachment_style?: string | null;
  boundary_preferences?: Record<string, unknown>;
  common_triggers?: string[];
}

export interface CreateEntityInput {
  user_id: string;
  label: string;
  relation_type?: string | null;
  notes?: string | null;
}

export interface CreateEventInput {
  user_id: string;
  entity_id?: string | null;
  event_type: string;
  event_time?: Date | string | null;
  summary: string;
  evidence_json?: unknown[];
}

export interface CreateSummaryInput {
  user_id: string;
  session_id?: string | null;
  summary_type: SummaryType;
  summary_text: string;
}

export interface MemoryRepository {
  getUserProfile(userId: string): Promise<UserProfileDTO | null>;
  upsertUserProfile(
    userId: string,
    memoryEnabled: boolean,
    input: UpsertProfileInput
  ): Promise<UserProfileDTO | null>;

  getRelationshipEntities(userId: string): Promise<RelationshipEntityDTO[]>;
  createRelationshipEntity(
    memoryEnabled: boolean,
    input: CreateEntityInput
  ): Promise<RelationshipEntityDTO | null>;

  getRelationshipEvents(
    userId: string,
    limit?: number
  ): Promise<RelationshipEventDTO[]>;
  createRelationshipEvent(
    memoryEnabled: boolean,
    input: CreateEventInput
  ): Promise<RelationshipEventDTO | null>;

  getMemorySummaries(
    userId: string,
    summaryType?: SummaryType,
    limit?: number
  ): Promise<MemorySummaryDTO[]>;
  createMemorySummary(
    memoryEnabled: boolean,
    input: CreateSummaryInput
  ): Promise<MemorySummaryDTO | null>;

  /**
   * 删除/匿名化用户全部长期记忆（CLAUDE.md §14.3）。
   * - memory_summaries：硬删除
   * - user_profiles：清空字段
   * - relationship_entities：label 改为 '[已删除]'，notes/relation_type 清空
   * - relationship_events：summary 改为 '[已删除]'，evidence_json 清空
   *
   * 在事务中执行；返回受影响数量。
   */
  deleteOrAnonymizeUserMemory(userId: string): Promise<{
    summariesDeleted: number;
    profileAnonymized: boolean;
    entitiesAnonymized: number;
    eventsAnonymized: number;
  }>;
}

export function createMemoryRepository(pool: Pool): MemoryRepository {
  return {
    async getUserProfile(userId) {
      const res = await pool.query<UserProfileRow>(
        `SELECT user_id, traits_json, attachment_style,
                boundary_preferences, common_triggers, updated_at
         FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const row = res.rows[0];
      return row ? profileToDTO(row) : null;
    },

    async upsertUserProfile(userId, memoryEnabled, input) {
      if (!memoryEnabled) return null;
      const res = await pool.query<UserProfileRow>(
        `INSERT INTO user_profiles
           (user_id, traits_json, attachment_style,
            boundary_preferences, common_triggers)
         VALUES ($1, COALESCE($2::jsonb, '{}'::jsonb), $3,
                 COALESCE($4::jsonb, '{}'::jsonb),
                 COALESCE($5, ARRAY[]::TEXT[]))
         ON CONFLICT (user_id) DO UPDATE SET
           traits_json          = COALESCE(EXCLUDED.traits_json, user_profiles.traits_json),
           attachment_style     = COALESCE(EXCLUDED.attachment_style, user_profiles.attachment_style),
           boundary_preferences = COALESCE(EXCLUDED.boundary_preferences, user_profiles.boundary_preferences),
           common_triggers      = COALESCE(EXCLUDED.common_triggers, user_profiles.common_triggers)
         RETURNING user_id, traits_json, attachment_style,
                   boundary_preferences, common_triggers, updated_at`,
        [
          userId,
          input.traits_json ? JSON.stringify(input.traits_json) : null,
          input.attachment_style ?? null,
          input.boundary_preferences
            ? JSON.stringify(input.boundary_preferences)
            : null,
          input.common_triggers ?? null,
        ]
      );
      const row = res.rows[0];
      return row ? profileToDTO(row) : null;
    },

    async getRelationshipEntities(userId) {
      const res = await pool.query<RelationshipEntityRow>(
        `SELECT id, user_id, label, relation_type, notes,
                created_at, updated_at
         FROM relationship_entities
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );
      return res.rows.map(entityToDTO);
    },

    async createRelationshipEntity(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      const res = await pool.query<RelationshipEntityRow>(
        `INSERT INTO relationship_entities
           (user_id, label, relation_type, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, label, relation_type, notes,
                   created_at, updated_at`,
        [input.user_id, input.label, input.relation_type ?? null, input.notes ?? null]
      );
      const row = res.rows[0];
      return row ? entityToDTO(row) : null;
    },

    async getRelationshipEvents(userId, limit = 10) {
      const res = await pool.query<RelationshipEventRow>(
        `SELECT id, user_id, entity_id, event_type, event_time,
                summary, evidence_json, created_at
         FROM relationship_events
         WHERE user_id = $1
         ORDER BY event_time DESC NULLS LAST, created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return res.rows.map(eventToDTO);
    },

    async createRelationshipEvent(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      const res = await pool.query<RelationshipEventRow>(
        `INSERT INTO relationship_events
           (user_id, entity_id, event_type, event_time, summary, evidence_json)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '[]'::jsonb))
         RETURNING id, user_id, entity_id, event_type, event_time,
                   summary, evidence_json, created_at`,
        [
          input.user_id,
          input.entity_id ?? null,
          input.event_type,
          input.event_time ?? null,
          input.summary,
          input.evidence_json ? JSON.stringify(input.evidence_json) : null,
        ]
      );
      const row = res.rows[0];
      return row ? eventToDTO(row) : null;
    },

    async getMemorySummaries(userId, summaryType, limit = 3) {
      const params: unknown[] = [userId];
      let where = 'user_id = $1';
      if (summaryType) {
        params.push(summaryType);
        where += ` AND summary_type = $${params.length}`;
      }
      params.push(limit);
      const res = await pool.query<MemorySummaryRow>(
        `SELECT id, user_id, session_id, summary_type, summary_text, created_at
         FROM memory_summaries
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
      );
      return res.rows.map(summaryToDTO);
    },

    async createMemorySummary(memoryEnabled, input) {
      if (!memoryEnabled) return null;
      const res = await pool.query<MemorySummaryRow>(
        `INSERT INTO memory_summaries
           (user_id, session_id, summary_type, summary_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, session_id, summary_type, summary_text, created_at`,
        [
          input.user_id,
          input.session_id ?? null,
          input.summary_type,
          input.summary_text,
        ]
      );
      const row = res.rows[0];
      return row ? summaryToDTO(row) : null;
    },

    async deleteOrAnonymizeUserMemory(userId) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1) 真删除会话摘要
        const sumRes = await client.query(
          `DELETE FROM memory_summaries WHERE user_id = $1`,
          [userId]
        );

        // 2) 真删除关系事件（先删，避免 FK 约束阻塞 entity 删除）
        const evtRes = await client.query(
          `DELETE FROM relationship_events WHERE user_id = $1`,
          [userId]
        );

        // 3) 真删除关系对象
        const entRes = await client.query(
          `DELETE FROM relationship_entities WHERE user_id = $1`,
          [userId]
        );

        // 4) user_profiles 仍然保留行（保护 PK 与 user 关联完整性），
        //    只清空所有可识别画像字段
        const profRes = await client.query(
          `UPDATE user_profiles
             SET traits_json          = '{}'::jsonb,
                 attachment_style     = NULL,
                 boundary_preferences = '{}'::jsonb,
                 common_triggers      = ARRAY[]::TEXT[]
           WHERE user_id = $1`,
          [userId]
        );

        await client.query('COMMIT');

        return {
          summariesDeleted: sumRes.rowCount ?? 0,
          profileAnonymized: (profRes.rowCount ?? 0) > 0,
          entitiesAnonymized: entRes.rowCount ?? 0,
          eventsAnonymized: evtRes.rowCount ?? 0,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
