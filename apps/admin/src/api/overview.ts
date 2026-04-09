import { adminRequest } from './client';

/**
 * 后端 GET /admin/overview 实际返回的数据结构。
 * adminRequest 会 unwrap { success, data } 层，这里定义 data 的形状。
 */
export interface OverviewData {
  users: {
    total: number;
    today: number;
    this_week: number;
    this_month: number;
  };
  conversations: {
    total_sessions: number;
    total_messages: number;
    today_messages: number;
    avg_messages_per_user: number;
  };
  modes: Record<string, number>;
  emotions: Record<string, number>;
  safety_triggers: {
    total: number;
    high: number;
    critical: number;
    today: number;
  };
}

export function fetchOverview(): Promise<OverviewData> {
  return adminRequest<OverviewData>('/admin/overview');
}
