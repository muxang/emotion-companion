import { adminRequest, adminPaginatedRequest, type PaginatedResult } from './client';

/** 后端 GET /admin/users 返回的用户行 */
export interface AdminUserItem {
  id: string;
  anonymous_id: string;
  created_at: string;
  last_active_at: string | null;
  total_sessions: number;
  total_messages: number;
  memory_enabled: boolean;
  tone_preference: string;
  has_active_plan: boolean;
}

export type AdminUserListResponse = PaginatedResult<AdminUserItem>;

export function fetchUsers(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUserListResponse> {
  return adminPaginatedRequest<AdminUserItem>('/admin/users', { query: params });
}

/** 后端 GET /admin/users/:id 的 data 结构 */
export interface AdminUserDetail {
  user: {
    id: string;
    anonymous_id: string;
    email: string | null;
    nickname: string | null;
    tone_preference: string;
    memory_enabled: boolean;
    created_at: string;
    updated_at: string;
  };
  stats: {
    total_sessions: number;
    total_messages: number;
    avg_risk_level: string | null;
    dominant_emotion: string | null;
    days_active: number;
  };
  recent_sessions: Array<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: string;
    last_message_at: string | null;
  }>;
  active_plan: {
    id: string;
    plan_type: string;
    current_day: number;
    total_days: number;
    status: string;
    started_at: string;
  } | null;
  relationship_entities: Array<{
    id: string;
    label: string;
    relation_type: string | null;
  }>;
  emotion_trend: {
    daily: Array<{ date: string; avg_score: number | null }>;
  };
}

export function fetchUserDetail(id: string): Promise<AdminUserDetail> {
  return adminRequest<AdminUserDetail>(`/admin/users/${id}`);
}

/** 后端 GET /admin/users/:id/sessions/:sessionId 的 data.messages 元素 */
export interface AdminMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  intake_result: Record<string, unknown> | null;
  structured_json: Record<string, unknown> | null;
}

/** 后端返回 { session, messages }，messages 是数组 */
export interface SessionDetailData {
  session: Record<string, unknown>;
  messages: AdminMessage[];
}

export function fetchSessionMessages(
  userId: string,
  sessionId: string
): Promise<SessionDetailData> {
  return adminRequest<SessionDetailData>(
    `/admin/users/${userId}/sessions/${sessionId}`
  );
}
