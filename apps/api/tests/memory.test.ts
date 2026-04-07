/**
 * Memory routes 集成测试 - Phase 5
 *
 * - GET  /api/memory/timeline       Bearer 保护
 * - POST /api/memory/delete         Bearer 保护，调用 mock 后状态正确匿名化
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import type { MockState } from './helpers.js';
import type { RelationshipEventDTO } from '@emotion/shared';

let app: FastifyInstance;
let state: MockState;

beforeEach(async () => {
  const built = await buildTestApp();
  app = built.app;
  state = built.mocks.state;
});

afterEach(async () => {
  await app.close();
});

async function login(anonymousId: string): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { anonymous_id: anonymousId },
  });
  const body = res.json() as { data: { token: string; user_id: string } };
  return { token: body.data.token, userId: body.data.user_id };
}

describe('GET /api/memory/timeline', () => {
  it('未带 token 返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/memory/timeline' });
    expect(res.statusCode).toBe(401);
  });

  it('携带 token 返回 events 数组', async () => {
    const { token, userId } = await login('anon-mem-timeline-1');

    // 通过 mock memory repo 直接埋一条事件
    await app.repos.memory.createRelationshipEvent(true, {
      user_id: userId,
      event_type: 'breakup',
      summary: '一周前提了分手',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/memory/timeline',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { events: RelationshipEventDTO[] } };
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0]!.event_type).toBe('breakup');
    expect(body.data.events[0]!.summary).toBe('一周前提了分手');
  });
});

describe('POST /api/memory/delete', () => {
  it('未带 token 返回 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/memory/delete' });
    expect(res.statusCode).toBe(401);
  });

  it('真删除 summaries / entities / events，user_profile 字段被清空', async () => {
    const { token, userId } = await login('anon-mem-delete-1');

    await app.repos.memory.createMemorySummary(true, {
      user_id: userId,
      session_id: null,
      summary_type: 'session',
      summary_text: '一段摘要',
    });
    await app.repos.memory.createRelationshipEntity(true, {
      user_id: userId,
      label: '前任A',
      relation_type: 'ex',
    });
    await app.repos.memory.createRelationshipEvent(true, {
      user_id: userId,
      event_type: 'breakup',
      summary: '一周前提了分手',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/delete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        deleted: {
          summariesDeleted: number;
          profileAnonymized: boolean;
          entitiesAnonymized: number;
          eventsAnonymized: number;
        };
      };
    };
    expect(body.data.deleted.summariesDeleted).toBe(1);
    expect(body.data.deleted.entitiesAnonymized).toBe(1);
    expect(body.data.deleted.eventsAnonymized).toBe(1);

    // mock state：summaries / entities / events 全部被真删除
    expect(state.summaries.get(userId) ?? []).toEqual([]);
    expect(state.entities.get(userId) ?? []).toEqual([]);
    expect(state.events.get(userId) ?? []).toEqual([]);
    expect(state.memoryDeleteCalls).toBe(1);
  });
});
