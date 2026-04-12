import { adminPaginatedRequest, type PaginatedResult } from './client';

/** 后端 GET /admin/conversations 返回的消息行 */
export interface ConversationItem {
  id: string;
  session_id: string;
  user_id: string;
  anonymous_id: string;
  role: string;
  content: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  intake_result: Record<string, unknown> | null;
  structured_json: Record<string, unknown> | null;
  created_at: string;
}

export type ConversationListResponse = PaginatedResult<ConversationItem>;

export function fetchConversations(params: {
  risk_level?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}): Promise<ConversationListResponse> {
  return adminPaginatedRequest<ConversationItem>('/admin/conversations', {
    query: params,
  });
}
