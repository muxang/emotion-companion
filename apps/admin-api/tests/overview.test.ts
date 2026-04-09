import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildAdminApp } from '../src/app.js';
import { createMockPool, qr } from './helpers.js';

describe('GET /admin/overview', () => {
  let app: FastifyInstance;
  const TOKEN = process.env.ADMIN_TOKEN!;

  beforeAll(async () => {
    let callIndex = 0;
    const pool = createMockPool(() => {
      callIndex++;
      // overview route fires 13 parallel queries, all returning counts or agg rows
      switch (callIndex) {
        case 1: return qr([{ count: '100' }]);        // users total
        case 2: return qr([{ count: '5' }]);          // users today
        case 3: return qr([{ count: '30' }]);         // users this_week
        case 4: return qr([{ count: '80' }]);         // users this_month
        case 5: return qr([{ count: '200' }]);        // sessions total
        case 6: return qr([{ count: '1000' }]);       // messages total
        case 7: return qr([{ count: '50' }]);         // messages today
        case 8: return qr([                            // modes agg
          { mode: 'companion', count: '400' },
          { mode: 'analysis', count: '200' },
          { mode: 'coach', count: '100' },
          { mode: 'recovery', count: '50' },
          { mode: 'safety', count: '20' },
        ]);
        case 9: return qr([                            // emotions agg
          { emotion: 'sad', count: '300' },
          { emotion: 'anxious', count: '200' },
          { emotion: 'confused', count: '100' },
        ]);
        case 10: return qr([{ count: '15' }]);        // safety total
        case 11: return qr([{ count: '10' }]);        // safety high
        case 12: return qr([{ count: '5' }]);         // safety critical
        case 13: return qr([{ count: '3' }]);         // safety today
        default: return qr([{ count: '0' }]);
      }
    });
    app = await buildAdminApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns full overview structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      headers: { 'x-admin-token': TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.users.total).toBe(100);
    expect(data.users.today).toBe(5);
    expect(data.users.this_week).toBe(30);
    expect(data.users.this_month).toBe(80);

    expect(data.conversations.total_sessions).toBe(200);
    expect(data.conversations.total_messages).toBe(1000);
    expect(data.conversations.today_messages).toBe(50);
    expect(data.conversations.avg_messages_per_user).toBe(10);

    expect(data.modes.companion).toBe(400);
    expect(data.modes.analysis).toBe(200);
    expect(data.modes.safety).toBe(20);

    expect(data.emotions.sad).toBe(300);
    expect(data.emotions.anxious).toBe(200);

    expect(data.safety_triggers.total).toBe(15);
    expect(data.safety_triggers.high).toBe(10);
    expect(data.safety_triggers.critical).toBe(5);
    expect(data.safety_triggers.today).toBe(3);
  });
});
