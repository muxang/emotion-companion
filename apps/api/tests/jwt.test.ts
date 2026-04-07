import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeEach(async () => {
  ({ app } = await buildTestApp());
});

afterEach(async () => {
  await app.close();
});

describe('JWT auth middleware', () => {
  async function loginAndGetToken(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { anonymous_id: 'anon-jwt-test-1234' },
    });
    return (res.json() as { data: { token: string } }).data.token;
  }

  it('rejects requests without a token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions' });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed tokens (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: 'Bearer garbage' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects tokens signed with the wrong secret (401)', async () => {
    // Header.payload.signature 任意拼一个符合 JWT 结构但签名错的 token
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: {
        authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiaWF0IjoxfQ.invalid',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a freshly minted token', async () => {
    const token = await loginAndGetToken();
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
