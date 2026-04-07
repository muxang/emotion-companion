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

interface DeleteMemoryResponse {
  deleted: boolean;
}

/** 清除当前用户的长期记忆（摘要 + 实体 + 事件）。 */
export async function deleteMemory(): Promise<void> {
  await fetchJson<DeleteMemoryResponse>('/api/memory/delete', {
    method: 'POST',
  });
}
