import { fetchJson } from './client.js';

/**
 * 恢复计划 DTO（Phase 6）。
 * 后端契约见 CLAUDE.md §12.1：/api/recovery-plans 系列接口。
 */
export type RecoveryPlanType = '7-day-breakup' | '14-day-overthinking' | string;
export type RecoveryPlanStatus = 'active' | 'completed' | 'abandoned' | string;

export interface RecoveryPlan {
  id: string;
  user_id: string;
  plan_type: RecoveryPlanType;
  total_days: number;
  current_day: number;
  status: RecoveryPlanStatus;
  started_at: string;
}

export interface RecoveryTodayTask {
  task: string;
  reflection_prompt: string;
  encouragement: string;
}

export interface RecoveryCheckin {
  id: string;
  plan_id: string;
  day_index: number;
  completed: boolean;
  reflection: string | null;
  mood_score: number | null;
  created_at: string;
}

export interface RecoveryPlanDetail {
  plan: RecoveryPlan;
  todayTask: RecoveryTodayTask | null;
  checkins: RecoveryCheckin[];
}

/** 拉取当前用户的所有恢复计划。 */
export async function getPlans(): Promise<RecoveryPlan[]> {
  const data = await fetchJson<{ plans: RecoveryPlan[] }>(
    '/api/recovery-plans',
    { method: 'GET' }
  );
  return data.plans ?? [];
}

/** 创建一个新的恢复计划。 */
export async function createPlan(
  planType: RecoveryPlanType
): Promise<RecoveryPlan> {
  const data = await fetchJson<{ plan: RecoveryPlan }>('/api/recovery-plans', {
    method: 'POST',
    body: JSON.stringify({ plan_type: planType }),
  });
  return data.plan;
}

/** 获取计划详情，含今日任务与历史打卡。 */
export async function getPlanDetail(id: string): Promise<RecoveryPlanDetail> {
  const data = await fetchJson<{
    plan: RecoveryPlan;
    todayTask: RecoveryTodayTask | null;
    checkins: RecoveryCheckin[];
  }>(`/api/recovery-plans/${id}`, { method: 'GET' });
  return {
    plan: data.plan,
    todayTask: data.todayTask ?? null,
    checkins: data.checkins ?? [],
  };
}

/** 为当前计划提交打卡。 */
export async function submitCheckin(
  id: string,
  payload: { mood_score: number; reflection?: string }
): Promise<RecoveryCheckin> {
  const data = await fetchJson<{ checkin: RecoveryCheckin }>(
    `/api/recovery-plans/${id}/checkin`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return data.checkin;
}
