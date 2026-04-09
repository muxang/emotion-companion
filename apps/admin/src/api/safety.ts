import { adminPaginatedRequest, type PaginatedResult } from './client';

/** 后端 GET /admin/safety 返回的安全事件行 */
export interface SafetyEvent {
  id: string;
  user_anonymous_id: string;
  session_id: string;
  risk_level: 'high' | 'critical';
  trigger_reason: string | null;
  action_taken: string | null;
  created_at: string;
}

export type SafetyListResponse = PaginatedResult<SafetyEvent>;

export function fetchSafetyEvents(params: {
  level?: string;
  page?: number;
  limit?: number;
}): Promise<SafetyListResponse> {
  return adminPaginatedRequest<SafetyEvent>('/admin/safety', {
    query: params,
  });
}
