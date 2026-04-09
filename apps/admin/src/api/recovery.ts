import { adminRequest } from './client';

export interface RecoveryStats {
  total_plans: number;
  in_progress: number;
  completed: number;
  completion_rate: number; // 0-1
  type_share: Array<{ plan_type: string; count: number }>;
  daily_checkin_rate: Array<{ date: string; rate: number }>; // 0-1
}

export interface RecoveryPlanItem {
  id: string;
  user_id: string;
  anonymous_id: string;
  plan_type: string;
  progress: number; // 0-1
  status: string;
  started_at: string;
}

export interface RecoveryListResponse {
  stats: RecoveryStats;
  items: RecoveryPlanItem[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchRecovery(params: {
  page?: number;
  page_size?: number;
}): Promise<RecoveryListResponse> {
  return adminRequest<RecoveryListResponse>('/admin/recovery', { query: params });
}
