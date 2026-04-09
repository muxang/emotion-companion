import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildAdminApp } from '../src/app.js';
import { createMockPool, qr } from './helpers.js';

const TOKEN = process.env.ADMIN_TOKEN!;

describe('GET /admin/users', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    let callIndex = 0;
    const pool = createMockPool(() => {
      callIndex++;
      switch (callIndex) {
        case 1: return qr([{ count: '2' }]); // total
        case 2: return qr([                   // list
          {
            id: '00000000-0000-0000-0000-000000000001',
            anonymous_id: 'anon-a',
            created_at: new Date('2026-01-01'),
            memory_enabled: true,
            tone_preference: 'warm',
            total_sessions: '3',
            total_messages: '25',
            last_active_at: new Date('2026-04-09'),
            has_active_plan: false,
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            anonymous_id: 'anon-b',
            created_at: new Date('2026-03-01'),
            memory_enabled: false,
            tone_preference: 'rational',
            total_sessions: '1',
            total_messages: '5',
            last_active_at: null,
            has_active_plan: true,
          },
        ]);
        default: return qr([{ count: '0' }]);
      }
    });
    app = await buildAdminApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns paginated user list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?page=1&limit=10',
      headers: { 'x-admin-token': TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.data).toHaveLength(2);

    expect(body.data[0].anonymous_id).toBe('anon-a');
    expect(body.data[0].total_sessions).toBe(3);
    expect(body.data[0].total_messages).toBe(25);
    expect(body.data[1].has_active_plan).toBe(true);
  });
});

describe('GET /admin/users/:id', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    let callIndex = 0;
    const pool = createMockPool(() => {
      callIndex++;
      switch (callIndex) {
        case 1: return qr([{                // user row
          id: '00000000-0000-0000-0000-000000000001',
          anonymous_id: 'anon-a',
          email: null,
          open_id: null,
          nickname: null,
          tone_preference: 'warm',
          memory_enabled: true,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-04-01'),
        }]);
        case 2: return qr([{               // stats
          total_sessions: '3',
          total_messages: '25',
          avg_risk_level: 'low',
          dominant_emotion: 'sad',
          days_active: '10',
        }]);
        case 3: return qr([{               // recent sessions
          id: 's1',
          title: '新对话',
          message_count: 10,
          created_at: new Date('2026-04-01'),
          last_message_at: new Date('2026-04-01'),
        }]);
        case 4: return qr([]);             // active plan
        case 5: return qr([]);             // relationship entities
        case 6: return qr([               // emotion trend
          { date: '2026-03-27', avg_score: '4' },
          { date: '2026-03-28', avg_score: null },
        ]);
        default: return qr([]);
      }
    });
    app = await buildAdminApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns user detail structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/00000000-0000-0000-0000-000000000001',
      headers: { 'x-admin-token': TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    expect(body.data.user.anonymous_id).toBe('anon-a');
    expect(body.data.stats.total_sessions).toBe(3);
    expect(body.data.stats.total_messages).toBe(25);
    expect(body.data.stats.dominant_emotion).toBe('sad');
    expect(body.data.stats.days_active).toBe(10);
    expect(body.data.recent_sessions).toHaveLength(1);
    expect(body.data.active_plan).toBeNull();
    expect(body.data.emotion_trend.daily).toHaveLength(2);
    expect(body.data.emotion_trend.daily[0].avg_score).toBe(4);
    expect(body.data.emotion_trend.daily[1].avg_score).toBeNull();
  });

  it('returns 404 for unknown user', async () => {
    let callIndex = 0;
    const pool = createMockPool(() => {
      callIndex++;
      return qr([]);
    });
    const app2 = await buildAdminApp({ pool });
    await app2.ready();

    const res = await app2.inject({
      method: 'GET',
      url: '/admin/users/00000000-0000-0000-0000-999999999999',
      headers: { 'x-admin-token': TOKEN },
    });
    expect(res.statusCode).toBe(404);
    await app2.close();
  });
});
