import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let mocks: Awaited<ReturnType<typeof buildTestApp>>['mocks'];

beforeEach(async () => {
  const built = await buildTestApp();
  app = built.app;
  mocks = built.mocks;
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/auth/login', () => {
  it('creates a new user when anonymous_id is unknown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'anon-1234567890' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      success: boolean;
      data: { token: string; user_id: string; expires_in: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.user_id).toBeTruthy();
    expect(body.data.expires_in).toBeGreaterThan(0);
    expect(mocks.state.createdUsers).toBe(1);
  });

  it('reuses existing user without creating a new one', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'anon-existing-user' },
    });
    expect(first.statusCode).toBe(200);
    expect(mocks.state.createdUsers).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'anon-existing-user' },
    });
    expect(second.statusCode).toBe(200);
    expect(mocks.state.createdUsers).toBe(1); // 未再次创建

    const a = first.json() as { data: { user_id: string } };
    const b = second.json() as { data: { user_id: string } };
    expect(a.data.user_id).toBe(b.data.user_id);
  });

  it('returns 422 when anonymous_id is too short', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'short' },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when body is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns a new token for a valid bearer', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'anon-refresh-1234' },
    });
    const { token } = (login.json() as { data: { token: string } }).data;

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(refresh.statusCode).toBe(200);
    const body = refresh.json() as {
      data: { token: string; user_id: string };
    };
    expect(body.data.token).toBeTruthy();
  });

  it('returns 401 when bearer is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when bearer is malformed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });
});
