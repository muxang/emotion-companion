import { fetchJson } from './client.js';

/**
 * 成长记录三类信号（Phase 5 / Phase 7）。
 * 对应 GET /api/memory/timeline。
 */
export interface TimelineEvent {
  id: string;
  event_type: string;
  event_time: string | null;
  summary: string;
  entity_label?: string | null;
  created_at: string;
}

export interface TimelineEntity {
  id: string;
  label: string;
  relation_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineSummary {
  id: string;
  session_id: string | null;
  summary_type: 'session' | 'weekly' | 'entity';
  summary_text: string;
  created_at: string;
}

export interface GrowthFeed {
  events: TimelineEvent[];
  entities: TimelineEntity[];
  summaries: TimelineSummary[];
}

/** 拉取用户的成长记录（events / entities / summaries 三类）。 */
export async function getTimeline(): Promise<GrowthFeed> {
  const data = await fetchJson<GrowthFeed>('/api/memory/timeline', {
    method: 'GET',
  });
  return {
    events: data.events ?? [],
    entities: data.entities ?? [],
    summaries: data.summaries ?? [],
  };
}

/** 情绪趋势（Phase 7+） */
export interface EmotionTrend {
  average_score: number;
  direction: 'improving' | 'stable' | 'declining';
  consecutive_low_days: number;
  peak_hours: number[];
  dominant_emotion: string;
  mention_count: Record<string, number>;
  data_points: number;
}

export interface EmotionTrendResult {
  trend: EmotionTrend | null;
  message: string;
}

export async function getEmotionTrend(days = 7): Promise<EmotionTrendResult> {
  return fetchJson<EmotionTrendResult>(
    `/api/memory/emotion-trend?days=${days}`,
    { method: 'GET' }
  );
}

/** 隐性关系模式（Phase 7+） */
export interface RelationshipPattern {
  pattern_type: string;
  sub_type: string | null;
  confidence: number;
  evidence_count: number;
  hit_examples: string[];
  title: string;
  subtitle: string;
  description: string;
  real_cost: string;
  suggestion: string;
  next_step: string;
}

export interface PatternsResponse {
  patterns: RelationshipPattern[];
  analyzed_messages: number;
  sufficient_data: boolean;
  cached: boolean;
  message: string;
}

export async function getPatterns(): Promise<PatternsResponse> {
  return fetchJson<PatternsResponse>('/api/memory/patterns', {
    method: 'GET',
  });
}

interface DeleteMemoryResponse {
  deleted: boolean;
}

/** 清除当前用户的长期记忆（摘要 + 实体 + 事件）。 */
export async function deleteMemory(): Promise<void> {
  await fetchJson<DeleteMemoryResponse>('/api/memory/delete', {
    method: 'POST',
  });
}
