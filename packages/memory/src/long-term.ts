/** Long-term memory facade - Phase 0 skeleton. Phase 5 接入 PostgreSQL. */
export interface LongTermSummary {
  user_id: string;
  topic: string;
  content: string;
  created_at: Date;
}

export class LongTermMemory {
  async write(_summary: LongTermSummary): Promise<void> {
    throw new Error('LongTermMemory.write not implemented (Phase 5)');
  }

  async query(_userId: string): Promise<LongTermSummary[]> {
    throw new Error('LongTermMemory.query not implemented (Phase 5)');
  }
}
