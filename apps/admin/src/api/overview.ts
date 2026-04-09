import { adminRequest } from './client';

export interface OverviewStats {
  total_users: number;
  new_users_today: number;
  messages_today: number;
  messages_yesterday: number;
  safety_trigger_rate: number; // 0-1
  plan_completion_rate: number; // 0-1
}

export interface MessageTrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ModeShare {
  mode: string;
  count: number;
}

export interface EmotionShare {
  emotion: string;
  count: number;
}

export interface SafetyShare {
  level: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  today_count?: number;
}

export interface OverviewData {
  stats: OverviewStats;
  message_trend: MessageTrendPoint[];
  mode_share: ModeShare[];
  emotion_share: EmotionShare[];
  safety_share: SafetyShare[];
}

export function fetchOverview(): Promise<OverviewData> {
  return adminRequest<OverviewData>('/admin/overview');
}
