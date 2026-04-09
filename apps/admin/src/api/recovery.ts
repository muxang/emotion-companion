import { adminRequest } from './client';

/** 后端 GET /admin/recovery/stats 返回的统计数据 */
export interface RecoveryStats {
  total_plans: number;
  active_plans: number;
  completed_plans: number;
  completion_rate: number; // 百分比，如 80 表示 80%
  avg_days_completed: number;
  plan_type_distribution: Record<string, number>;
  daily_checkin_rate: number[]; // 最近 14 天每日打卡率
}

export function fetchRecoveryStats(): Promise<RecoveryStats> {
  return adminRequest<RecoveryStats>('/admin/recovery/stats');
}
