import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  RecoveryCheckinDTO,
  RecoveryPlanDTO,
} from '@emotion/shared';
import { buildTestApp, createFakeAIClient } from './helpers.js';

let app: FastifyInstance;

const VALID_TASK_JSON = JSON.stringify({
  task: '今天散步 20 分钟',
  reflection_prompt: '走完后留意身体最先松下来的地方',
  encouragement: '你今天已经在为自己做事了',
});

beforeEach(async () => {
  // 详情接口需要 AI 返回 task JSON；用 FakeAIClient 始终回放 VALID_TASK_JSON
  ({ app } = await buildTestApp({
    aiClient: createFakeAIClient({ completeReplies: [VALID_TASK_JSON] }),
  }));
});

afterEach(async () => {
  await app.close();
});

async function login(anonymousId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { anonymous_id: anonymousId },
  });
  return (res.json() as { data: { token: string } }).data.token;
}

async function createPlan(
  token: string,
  planType: '7day-breakup' | '14day-rumination'
): Promise<RecoveryPlanDTO> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/recovery-plans',
    headers: { authorization: `Bearer ${token}` },
    payload: { plan_type: planType },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: { plan: RecoveryPlanDTO } }).data.plan;
}

describe('Recovery plans routes', () => {
  it('creates a 7-day plan with correct defaults', async () => {
    const token = await login('anon-recovery-1');
    const plan = await createPlan(token, '7day-breakup');

    expect(plan.plan_type).toBe('7day-breakup');
    expect(plan.total_days).toBe(7);
    expect(plan.current_day).toBe(1);
    expect(plan.status).toBe('active');
  });

  it('creates a 14-day rumination plan with total_days=14', async () => {
    const token = await login('anon-recovery-2');
    const plan = await createPlan(token, '14day-rumination');
    expect(plan.total_days).toBe(14);
  });

  it('lists current user plans only', async () => {
    const tokenA = await login('anon-recovery-listA');
    const tokenB = await login('anon-recovery-listB');
    await createPlan(tokenA, '7day-breakup');
    await createPlan(tokenB, '14day-rumination');

    const listA = await app.inject({
      method: 'GET',
      url: '/api/recovery-plans',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const bodyA = listA.json() as { data: { plans: RecoveryPlanDTO[] } };
    expect(bodyA.data.plans).toHaveLength(1);
    expect(bodyA.data.plans[0]!.plan_type).toBe('7day-breakup');
  });

  it('returns plan detail with today_task and checkins[]', async () => {
    const token = await login('anon-recovery-detail');
    const plan = await createPlan(token, '7day-breakup');

    const res = await app.inject({
      method: 'GET',
      url: `/api/recovery-plans/${plan.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        plan: RecoveryPlanDTO;
        checkins: RecoveryCheckinDTO[];
        today_task: { task: string; day_index: number } | null;
      };
    };
    expect(body.data.plan.id).toBe(plan.id);
    expect(Array.isArray(body.data.checkins)).toBe(true);
    expect(body.data.today_task).not.toBeNull();
    expect(body.data.today_task!.day_index).toBe(1);
    expect(body.data.today_task!.task).toContain('散步');
  });

  it('forbids accessing another user plan with 404', async () => {
    const tokenA = await login('anon-recovery-ownerA');
    const tokenB = await login('anon-recovery-ownerB');
    const plan = await createPlan(tokenA, '7day-breakup');

    const res = await app.inject({
      method: 'GET',
      url: `/api/recovery-plans/${plan.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('completes a checkin, advances current_day, and persists reflection', async () => {
    const token = await login('anon-recovery-checkin');
    const plan = await createPlan(token, '7day-breakup');

    const res = await app.inject({
      method: 'POST',
      url: `/api/recovery-plans/${plan.id}/checkin`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reflection: '今天好像没有那么沉了', mood_score: 6 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { checkin: RecoveryCheckinDTO; plan: RecoveryPlanDTO };
    };
    expect(body.data.checkin.completed).toBe(true);
    expect(body.data.checkin.reflection).toBe('今天好像没有那么沉了');
    expect(body.data.checkin.mood_score).toBe(6);
    expect(body.data.plan.current_day).toBe(2);
    expect(body.data.plan.status).toBe('active');
  });

  it('marks plan completed after final checkin', async () => {
    const token = await login('anon-recovery-finish');
    const plan = await createPlan(token, '7day-breakup');

    // 连续打卡 7 次（每次 plan 推进一天，最后一次后 status=completed）
    for (let i = 0; i < 7; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/recovery-plans/${plan.id}/checkin`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      // 第 1~6 次 200；第 7 次后 plan 已 completed，仍允许那一次本身完成
      expect(res.statusCode).toBe(200);
    }

    const detail = await app.inject({
      method: 'GET',
      url: `/api/recovery-plans/${plan.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = detail.json() as {
      data: { plan: RecoveryPlanDTO; today_task: unknown };
    };
    expect(body.data.plan.status).toBe('completed');
    expect(body.data.plan.current_day).toBe(8);
    // completed 后不再生成今日任务
    expect(body.data.today_task).toBeNull();
  });

  it('rejects checkin on a non-active plan with 409', async () => {
    const token = await login('anon-recovery-409');
    const plan = await createPlan(token, '7day-breakup');

    // 推到 completed
    for (let i = 0; i < 7; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/recovery-plans/${plan.id}/checkin`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/recovery-plans/${plan.id}/checkin`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/recovery-plans',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid plan_type with 422', async () => {
    const token = await login('anon-recovery-422');
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery-plans',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan_type: 'not-a-real-plan' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects invalid mood_score with 422', async () => {
    const token = await login('anon-recovery-mood');
    const plan = await createPlan(token, '7day-breakup');
    const res = await app.inject({
      method: 'POST',
      url: `/api/recovery-plans/${plan.id}/checkin`,
      headers: { authorization: `Bearer ${token}` },
      payload: { mood_score: 99 },
    });
    expect(res.statusCode).toBe(422);
  });
});
