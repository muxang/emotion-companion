/**
 * Phase 6: Recovery plan domain types.
 *
 * 数据库实体 DTO（routes 层与 repositories 层共用）。
 * 注意：runtime 任务结构 RecoveryTask 已在 ./skill.ts 中定义。
 */

export type RecoveryPlanType = '7day-breakup' | '14day-rumination';
export type RecoveryPlanStatus = 'active' | 'paused' | 'completed';

export interface RecoveryPlanDTO {
  id: string;
  user_id: string;
  plan_type: RecoveryPlanType;
  total_days: number;
  current_day: number;
  status: RecoveryPlanStatus;
  payload_json: Record<string, unknown>;
  started_at: string;
  updated_at: string;
}

export interface RecoveryCheckinDTO {
  id: string;
  plan_id: string;
  day_index: number;
  completed: boolean;
  reflection: string | null;
  mood_score: number | null;
  created_at: string;
}
