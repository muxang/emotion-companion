import { adminRequest } from './client';

export interface ConversationItem {
  id: string;
  user_id: string;
  anonymous_id: string;
  content_preview: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  conversation_mode: string;
  emotion_state: string | null;
  created_at: string;
}

export interface ConversationListResponse {
  items: ConversationItem[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchConversations(params: {
  risk_level?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<ConversationListResponse> {
  return adminRequest<ConversationListResponse>('/admin/conversations', {
    query: params,
  });
}
