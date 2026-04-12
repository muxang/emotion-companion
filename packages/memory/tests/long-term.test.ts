/**
 * long-term.getUserMemory + formatMemoryContext 单元测试
 *
 * - memory_enabled=false 必须立即返回空骨架（不查询 DB）
 * - memory_enabled=true 时聚合四张表
 * - formatMemoryContext 在空记忆时返回空字符串
 */
import { describe, it, expect } from 'vitest';
import { getUserMemory, formatMemoryContext } from '../src/long-term.js';
import type { UserMemory } from '@emotion/shared';

function makeFakePool(rowsByCall: Array<unknown[]>): {
  pool: Parameters<typeof getUserMemory>[0];
  callCount: () => number;
} {
  let i = 0;
  const queryFn = async () => {
    const rows = rowsByCall[i] ?? [];
    i++;
    return { rows };
  };
  const pool = {
    async query() { return queryFn(); },
    async connect() {
      return {
        query: queryFn,
        release: () => {},
      };
    },
  } as unknown as Parameters<typeof getUserMemory>[0];
  return { pool, callCount: () => i };
}

describe('getUserMemory', () => {
  it('memory_enabled=false 立即返回空骨架，不触达 DB', async () => {
    const { pool, callCount } = makeFakePool([]);
    const result = await getUserMemory(pool, 'user-1', false);
    expect(callCount()).toBe(0);
    expect(result).toEqual({
      profile: null,
      entities: [],
      recentSummaries: [],
      recentEvents: [],
    });
  });

  it('memory_enabled=true 聚合四张表', async () => {
    const now = new Date('2026-04-01T00:00:00Z');
    const { pool } = makeFakePool([
      // profile
      [
        {
          user_id: 'user-1',
          traits_json: { likes: ['quiet'] },
          attachment_style: 'anxious',
          boundary_preferences: {},
          common_triggers: ['ghosting'],
          updated_at: now,
        },
      ],
      // entities
      [
        {
          id: 'e1',
          user_id: 'user-1',
          label: '前任A',
          relation_type: 'ex',
          notes: null,
          created_at: now,
          updated_at: now,
        },
      ],
      // summaries
      [
        {
          id: 's1',
          user_id: 'user-1',
          session_id: 'sess-1',
          summary_type: 'session',
          summary_text: '最近一次讨论分手议题',
          created_at: now,
        },
      ],
      // events
      [
        {
          id: 'ev1',
          user_id: 'user-1',
          entity_id: 'e1',
          event_type: 'breakup',
          event_time: now,
          summary: '一周前提了分手',
          evidence_json: [],
          created_at: now,
        },
      ],
    ]);
    const memory = await getUserMemory(pool, 'user-1', true);
    expect(memory.profile?.attachment_style).toBe('anxious');
    expect(memory.entities).toHaveLength(1);
    expect(memory.entities[0]!.label).toBe('前任A');
    expect(memory.recentSummaries).toHaveLength(1);
    expect(memory.recentEvents).toHaveLength(1);
    expect(memory.recentEvents[0]!.event_type).toBe('breakup');
  });
});

describe('formatMemoryContext', () => {
  it('空记忆返回空字符串', () => {
    const empty: UserMemory = {
      profile: null,
      entities: [],
      recentSummaries: [],
      recentEvents: [],
    };
    expect(formatMemoryContext(empty)).toBe('');
  });

  it('包含画像 / 实体 / 事件 / 摘要四个块', () => {
    const memory: UserMemory = {
      profile: {
        user_id: 'u1',
        traits_json: {},
        attachment_style: 'anxious',
        boundary_preferences: {},
        common_triggers: ['失联', '冷暴力'],
        updated_at: '2026-04-01T00:00:00Z',
      },
      entities: [
        {
          id: 'e1',
          user_id: 'u1',
          label: '小A',
          relation_type: 'ex',
          notes: null,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
      recentSummaries: [
        {
          id: 's1',
          user_id: 'u1',
          session_id: null,
          summary_type: 'session',
          summary_text: '上次谈到分手反复',
          created_at: '2026-04-02T00:00:00Z',
        },
      ],
      recentEvents: [
        {
          id: 'ev1',
          user_id: 'u1',
          entity_id: 'e1',
          event_type: 'breakup',
          event_time: '2026-03-25T00:00:00Z',
          summary: '一次正式提出分手',
          evidence_json: [],
          created_at: '2026-03-25T00:00:00Z',
        },
      ],
    };
    const text = formatMemoryContext(memory);
    // 叙事格式：不再用结构化标签，而是故事感
    expect(text).toMatch(/这个人的情况/);
    expect(text).toMatch(/上次他来/);
    expect(text).toMatch(/分手反复/); // 从 summary_text 来
    expect(text).toMatch(/小A/);
    expect(text).toMatch(/前任/); // relation_type=ex → 前任
    expect(text).toMatch(/正式提出分手/); // 从 event summary 来
  });
});
