/** Timeline of key relationship events - Phase 0 skeleton. */
export interface TimelineEvent {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: Date;
  description: string;
}

export class TimelineStore {
  async append(_event: TimelineEvent): Promise<void> {
    throw new Error('TimelineStore.append not implemented (Phase 5)');
  }

  async list(_userId: string): Promise<TimelineEvent[]> {
    throw new Error('TimelineStore.list not implemented (Phase 5)');
  }
}
