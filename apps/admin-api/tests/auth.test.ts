import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildAdminApp } from '../src/app.js';
import { createMockPool, qr } from './helpers.js';

describe('Admin auth middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createMockPool(() => qr([{ count: '0' }]));
    app = await buildAdminApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/overview' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when wrong token is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      headers: { 'x-admin-token': 'wrong-token-short-but-irrelevant' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes through with correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/overview',
      headers: {
        'x-admin-token': process.env.ADMIN_TOKEN!,
      },
    });
    // 不是 401 就说明鉴权通过了（即使 SQL 返回默认空值导致部分字段为 0）
    expect(res.statusCode).not.toBe(401);
  });
});
