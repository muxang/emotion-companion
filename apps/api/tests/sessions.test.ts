import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import type { SessionDTO } from '@emotion/shared';

let app: FastifyInstance;

beforeEach(async () => {
  ({ app } = await buildTestApp());
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

describe('Sessions CRUD', () => {
  it('creates and lists a session', async () => {
    const token = await login('anon-session-creator-01');

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '我的第一段对话' },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { data: { session: SessionDTO } };
    expect(createdBody.data.session.title).toBe('我的第一段对话');
    expect(createdBody.data.session.mode).toBe('companion');

    const list = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { data: { sessions: SessionDTO[] } };
    expect(listBody.data.sessions).toHaveLength(1);
  });

  it('returns session detail with messages array', async () => {
    const token = await login('anon-session-detail-1');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const sessionId = (created.json() as { data: { session: SessionDTO } })
      .data.session.id;

    const detail = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      data: { session: SessionDTO; messages: unknown[] };
    };
    expect(body.data.session.id).toBe(sessionId);
    expect(Array.isArray(body.data.messages)).toBe(true);
  });

  it('forbids accessing another user session (403)', async () => {
    const tokenA = await login('anon-user-a-1234');
    const tokenB = await login('anon-user-b-1234');

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const detail = await app.inject({
      method: 'GET',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(detail.statusCode).toBe(403);
  });

  it('deletes a session and returns 404 thereafter', async () => {
    const token = await login('anon-session-deleter-1');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(404);
  });

  it('rejects invalid session id format (422)', async () => {
    const token = await login('anon-session-bad-id-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/not-a-uuid',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /sessions/:id 修改标题成功', async () => {
    const token = await login('anon-session-rename-ok');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '这段暧昧三个月了' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { session: SessionDTO } };
    expect(body.data.session.title).toBe('这段暧昧三个月了');
  });

  it('PATCH /sessions/:id 越权访问返回 404', async () => {
    const tokenA = await login('anon-session-rename-A');
    const tokenB = await login('anon-session-rename-B');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { title: '我偷偷改' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /sessions/:id 拒绝空标题 (422)', async () => {
    const token = await login('anon-session-rename-empty');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('PATCH /sessions/:id 拒绝超长标题 (422)', async () => {
    const token = await login('anon-session-rename-long');
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const id = (created.json() as { data: { session: SessionDTO } }).data
      .session.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'x'.repeat(200) },
    });
    expect(res.statusCode).toBe(422);
  });
});
