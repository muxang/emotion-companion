import { fetchJson } from './client.js';

/**
 * 时间线事件 DTO（Phase 5）。
 * 后端契约见 CLAUDE.md §12.1，对应 GET /api/memory/timeline。
 */
export interface TimelineEvent {
  id: string;
  event_type: string;
  event_time: string | null;
  summary: string;
  entity_label: string | null;
  created_at: string;
}

interface TimelineResponse {
  events: TimelineEvent[];
}

/** 拉取用户的成长记录时间线。 */
export async function getTimeline(): Promise<TimelineEvent[]> {
  const data = await fetchJson<TimelineResponse>('/api/memory/timeline', {
    method: 'GET',
  });
  return data.events ?? [];
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
