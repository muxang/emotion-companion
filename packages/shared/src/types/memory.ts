/**
 * 记忆系统类型定义（CLAUDE.md §14）。
 *
 * - profile / entities / events / summaries 四张表的 DTO
 * - UserMemory 是 orchestrator Step 5 注入 prompt 的聚合视图
 *
 * 注意：所有时间字段统一使用 ISO 字符串（与 SessionDTO/MessageDTO 一致）。
 */

export type SummaryType = 'session' | 'weekly' | 'entity';

export interface UserProfileDTO {
  user_id: string;
  traits_json: Record<string, unknown>;
  attachment_style: string | null;
  boundary_preferences: Record<string, unknown>;
  common_triggers: string[];
  updated_at: string;
}

export interface RelationshipEntityDTO {
  id: string;
  user_id: string;
  label: string;
  relation_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RelationshipEventDTO {
  id: string;
  user_id: string;
  entity_id: string | null;
  event_type: string;
  event_time: string | null;
  summary: string;
  evidence_json: unknown[];
  created_at: string;
}

export interface MemorySummaryDTO {
  id: string;
  user_id: string;
  session_id: string | null;
  summary_type: SummaryType;
  summary_text: string;
  created_at: string;
}

/**
 * Orchestrator Step 5 注入 prompt 的长期记忆聚合视图。
 * memory_enabled=false 时返回空骨架（profile=null, 数组为空）。
 */
export interface UserMemory {
  profile: UserProfileDTO | null;
  entities: RelationshipEntityDTO[];
  recentSummaries: MemorySummaryDTO[];
  recentEvents: RelationshipEventDTO[];
}
