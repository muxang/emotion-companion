import { adminRequest } from './client';

export interface SafetyEvent {
  id: string;
  user_id: string;
  anonymous_id: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  trigger_reason: string;
  action_taken: string;
  created_at: string;
}

export interface SafetyListResponse {
  items: SafetyEvent[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    today_count: number;
    week_count: number;
  };
}

export function fetchSafetyEvents(params: {
  risk_level?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<SafetyListResponse> {
  return adminRequest<SafetyListResponse>('/admin/safety/events', {
    query: params,
  });
}
