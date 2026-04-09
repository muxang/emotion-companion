import { adminRequest } from './client';

export interface AdminUserItem {
  id: string;
  anonymous_id: string;
  created_at: string;
  last_active_at: string | null;
  session_count: number;
  message_count: number;
  memory_enabled: boolean;
  has_recovery_plan: boolean;
}

export interface AdminUserListResponse {
  items: AdminUserItem[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchUsers(params: {
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<AdminUserListResponse> {
  return adminRequest<AdminUserListResponse>('/admin/users', { query: params });
}

export interface RelationshipEntity {
  id: string;
  label: string;
  relation_type: string;
}

export interface AdminUserDetail {
  user: {
    id: string;
    anonymous_id: string;
    created_at: string;
    last_active_at: string | null;
    memory_enabled: boolean;
    tone_preference: string | null;
  };
  stats: {
    session_count: number;
    message_count: number;
    active_days: number;
    main_emotion: string | null;
  };
  emotion_trend: Array<{ date: string; score: number }>;
  relationship_entities: RelationshipEntity[];
  recovery_plan: {
    id: string;
    plan_type: string;
    progress: number;
    status: string;
    started_at: string;
  } | null;
  sessions: Array<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: string;
    last_message_at: string | null;
  }>;
}

export function fetchUserDetail(id: string): Promise<AdminUserDetail> {
  return adminRequest<AdminUserDetail>(`/admin/users/${id}`);
}

export interface AdminMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  emotion_state: string | null;
  next_mode: string | null;
}

export function fetchSessionMessages(
  userId: string,
  sessionId: string
): Promise<AdminMessage[]> {
  return adminRequest<AdminMessage[]>(
    `/admin/users/${userId}/sessions/${sessionId}/messages`
  );
}
